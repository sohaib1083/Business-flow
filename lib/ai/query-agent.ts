import 'server-only'
import { groqComplete, parseJsonLoose } from './groq'
import { buildQueryPlanPrompt } from './prompts'
import { buildQueryPlan } from './build-query-plan'
import { compileToSQL, compileToMongoPipeline } from './compile-query-plan'
import type { QueryPlan } from '@/types/query'
import type { SchemaInfo, ConnectionType } from '@/types/connection'

/**
 * Self-healing query agent.
 *
 * Given a question + schema, produces a plan, executes it, and if the
 * execution fails (bad SQL, non-existent column, type mismatch, etc) feeds the
 * error back into the LLM to produce a revised plan. Tries up to `maxAttempts`
 * times before giving up.
 *
 * `execute` is provided by the caller so this same loop works for Postgres,
 * MySQL, MongoDB, and DuckDB file queries.
 */

export interface AgentAttempt {
  attempt: number
  plan: QueryPlan
  compiledQuery: string
  error?: string
  rowCount?: number
  durationMs?: number
}

export interface AgentResult {
  plan: QueryPlan
  compiledQuery: string
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  attempts: AgentAttempt[]
}

export interface ExecuteFn {
  (plan: QueryPlan): Promise<{
    compiledQuery: string
    rows: Record<string, unknown>[]
    rowCount: number
    durationMs: number
  }>
}

export async function runQueryAgent(params: {
  question: string
  schema: SchemaInfo
  connectionType: ConnectionType
  execute: ExecuteFn
  maxAttempts?: number
  onAttempt?: (attempt: AgentAttempt) => void
}): Promise<AgentResult> {
  const maxAttempts = Math.max(1, Math.min(params.maxAttempts ?? 6, 10))
  const attempts: AgentAttempt[] = []

  // Initial plan from the question + schema.
  let plan = await buildQueryPlan(params.question, params.schema, params.connectionType)
  let lastError: string | null = null

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await params.execute(plan)
      const attempt: AgentAttempt = {
        attempt: i,
        plan,
        compiledQuery: res.compiledQuery,
        rowCount: res.rowCount,
        durationMs: res.durationMs,
      }
      attempts.push(attempt)
      params.onAttempt?.(attempt)
      return {
        plan,
        compiledQuery: res.compiledQuery,
        rows: res.rows,
        rowCount: res.rowCount,
        durationMs: res.durationMs,
        attempts,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastError = message

      // Snapshot what we tried so the caller can surface it in history.
      const compiledForLog = safeCompile(plan, params.connectionType)
      const attempt: AgentAttempt = {
        attempt: i,
        plan,
        compiledQuery: compiledForLog,
        error: message,
      }
      attempts.push(attempt)
      params.onAttempt?.(attempt)

      if (i === maxAttempts) break

      // Ask the LLM to repair the plan.
      plan = await repairPlan({
        question: params.question,
        schema: params.schema,
        connectionType: params.connectionType,
        previousPlan: plan,
        previousCompiled: compiledForLog,
        error: message,
        historyCount: i,
      })
    }
  }

  throw new Error(
    `Query failed after ${maxAttempts} attempts. Last error: ${lastError ?? 'unknown'}`,
  )
}

function safeCompile(plan: QueryPlan, type: ConnectionType): string {
  try {
    if (type === 'MONGODB') {
      return JSON.stringify(compileToMongoPipeline(plan))
    }
    return compileToSQL(plan)
  } catch {
    return '/* failed to compile plan */'
  }
}

async function repairPlan(params: {
  question: string
  schema: SchemaInfo
  connectionType: ConnectionType
  previousPlan: QueryPlan
  previousCompiled: string
  error: string
  historyCount: number
}): Promise<QueryPlan> {
  const system = buildQueryPlanPrompt(params.schema, params.connectionType)
  const user = [
    `Question: "${params.question}"`,
    '',
    `Your previous plan produced this ${params.connectionType === 'MONGODB' ? 'pipeline' : 'SQL'}:`,
    params.previousCompiled,
    '',
    'It failed with:',
    params.error,
    '',
    'Study the error carefully. Common causes:',
    '- A referenced column does not exist (check the schema; never guess names).',
    '- A column was not qualified with its table when joins are involved.',
    '- An unsupported agg was used (only sum/avg/count/min/max/distinct_count).',
    '- For date bucketing you must use the `timeBucket` field, not an agg.',
    '- For relative dates use raw SQL like "now() - interval \'30 days\'" with op ">=".',
    '- A needed JOIN was missing.',
    '',
    'Return a corrected JSON plan. Same shape as before. No prose.',
  ].join('\n')

  try {
    const raw = await groqComplete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: Math.min(0.1 + params.historyCount * 0.1, 0.5),
      maxTokens: 1024,
      json: true,
    })
    const parsed = parseJsonLoose<Record<string, unknown>>(raw)
    return normalizeRepaired(parsed, params.connectionType, params.previousPlan)
  } catch {
    // If even the repair call fails, keep the previous plan so we at least
    // surface a stable error instead of crashing.
    return params.previousPlan
  }
}

const VALID_SOURCES: QueryPlan['sourceType'][] = [
  'postgres',
  'mysql',
  'csv',
  'excel',
  'mongodb',
]
const VALID_INTENTS: QueryPlan['intent'][] = [
  'aggregate',
  'filter',
  'group',
  'timeseries',
  'ranking',
  'detail',
]

function normalizeRepaired(
  raw: Record<string, unknown>,
  connectionType: ConnectionType,
  fallback: QueryPlan,
): QueryPlan {
  const lc = connectionType.toLowerCase() as QueryPlan['sourceType']
  const sourceType = VALID_SOURCES.includes(raw.sourceType as QueryPlan['sourceType'])
    ? (raw.sourceType as QueryPlan['sourceType'])
    : VALID_SOURCES.includes(lc)
      ? lc
      : fallback.sourceType

  const intent = VALID_INTENTS.includes(raw.intent as QueryPlan['intent'])
    ? (raw.intent as QueryPlan['intent'])
    : fallback.intent

  const plan: QueryPlan = {
    sourceType,
    intent,
    entities: Array.isArray(raw.entities) ? (raw.entities as string[]) : fallback.entities,
    fields: Array.isArray(raw.fields) ? (raw.fields as QueryPlan['fields']) : fallback.fields,
    filters: Array.isArray(raw.filters)
      ? (raw.filters as QueryPlan['filters'])
      : fallback.filters,
  }
  if (Array.isArray(raw.groupBy)) plan.groupBy = raw.groupBy as string[]
  if (Array.isArray(raw.orderBy)) plan.orderBy = raw.orderBy as QueryPlan['orderBy']
  if (typeof raw.limit === 'number') plan.limit = Math.min(raw.limit, 1000)
  if (Array.isArray(raw.joins)) plan.joins = raw.joins as QueryPlan['joins']
  if (raw.timeBucket && typeof raw.timeBucket === 'object') {
    const tb = raw.timeBucket as { field?: string; unit?: string; alias?: string }
    if (tb.field && tb.unit) {
      const unit = tb.unit.toLowerCase() as NonNullable<QueryPlan['timeBucket']>['unit']
      if (['day', 'week', 'month', 'quarter', 'year'].includes(unit)) {
        plan.timeBucket = { field: tb.field, unit, alias: tb.alias }
      }
    }
  }
  return plan
}
