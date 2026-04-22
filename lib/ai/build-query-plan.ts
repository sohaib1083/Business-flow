import { groqComplete, parseJsonLoose } from './groq'
import { buildQueryPlanPrompt } from './prompts'
import type { QueryPlan } from '@/types/query'
import type { SchemaInfo, ConnectionType } from '@/types/connection'

const VALID_INTENTS: QueryPlan['intent'][] = [
  'aggregate',
  'filter',
  'group',
  'timeseries',
  'ranking',
  'detail',
]

const VALID_SOURCES: QueryPlan['sourceType'][] = [
  'postgres',
  'mysql',
  'csv',
  'excel',
  'mongodb',
]

function normalizePlan(raw: unknown, connectionType: string): QueryPlan {
  const parsed = (raw ?? {}) as Record<string, unknown>

  const sourceType = (
    VALID_SOURCES.includes(parsed.sourceType as QueryPlan['sourceType'])
      ? parsed.sourceType
      : VALID_SOURCES.includes(connectionType as QueryPlan['sourceType'])
        ? connectionType
        : 'postgres'
  ) as QueryPlan['sourceType']

  const intent = (
    VALID_INTENTS.includes(parsed.intent as QueryPlan['intent'])
      ? parsed.intent
      : 'detail'
  ) as QueryPlan['intent']

  const plan: QueryPlan = {
    sourceType,
    intent,
    entities: Array.isArray(parsed.entities) ? (parsed.entities as string[]) : [],
    fields: Array.isArray(parsed.fields) ? (parsed.fields as QueryPlan['fields']) : [],
    filters: Array.isArray(parsed.filters) ? (parsed.filters as QueryPlan['filters']) : [],
  }

  if (Array.isArray(parsed.groupBy)) plan.groupBy = parsed.groupBy as string[]
  if (Array.isArray(parsed.orderBy)) plan.orderBy = parsed.orderBy as QueryPlan['orderBy']
  if (typeof parsed.limit === 'number') plan.limit = Math.min(parsed.limit, 1000)
  if (Array.isArray(parsed.joins)) plan.joins = parsed.joins as QueryPlan['joins']
  if (parsed.timeBucket && typeof parsed.timeBucket === 'object') {
    const tb = parsed.timeBucket as { field?: string; unit?: string; alias?: string }
    if (tb.field && tb.unit) {
      const unit = tb.unit.toLowerCase() as NonNullable<QueryPlan['timeBucket']>['unit']
      if (['day', 'week', 'month', 'quarter', 'year'].includes(unit)) {
        plan.timeBucket = { field: tb.field, unit, alias: tb.alias }
      }
    }
  }

  return plan
}

export async function buildQueryPlan(
  question: string,
  schema: SchemaInfo,
  connectionType: ConnectionType,
  glossary?: string | null,
): Promise<QueryPlan> {
  const system = buildQueryPlanPrompt(schema, connectionType)
  const userContent = glossary
    ? `Question: "${question}"\n\nBusiness glossary:\n${glossary}`
    : `Question: "${question}"`

  try {
    const raw = await groqComplete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      maxTokens: 1024,
      json: true,
    })
    return normalizePlan(parseJsonLoose(raw), connectionType)
  } catch {
    const fallback = connectionType.toLowerCase() as QueryPlan['sourceType']
    return {
      sourceType: VALID_SOURCES.includes(fallback) ? fallback : 'postgres',
      intent: 'detail',
      entities: [],
      fields: [],
      filters: [],
    }
  }
}
