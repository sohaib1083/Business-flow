import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import {
  getConnection,
  getSession,
  appendMessage,
  recordRun,
  touchSession,
} from '@/lib/data/repos'
import { compileToSQL, compileToMongoPipeline } from '@/lib/ai/compile-query-plan'
import { summarizeResult } from '@/lib/ai/summarize-result'
import { decideFormat } from '@/lib/ai/decide-format'
import { runQueryAgent, type AgentAttempt } from '@/lib/ai/query-agent'
import { sanitizeSQL } from '@/lib/db/sanitize-sql'
import { sanitizePipeline } from '@/lib/db/sanitize-pipeline'
import { redactSensitiveColumns } from '@/lib/security/redact'
import { getConnector } from '@/lib/db/router'
import { downloadBuffer } from '@/lib/files/storage'
import type {
  PostgresCredentials,
  MySQLCredentials,
  MongoCredentials,
  SchemaInfo,
  FileConnectionMeta,
} from '@/types/connection'
import type { QueryRunResult, FormattedResponse, QueryPlan } from '@/types/query'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  sessionId: z.string().min(1),
  connectionId: z.string().min(1),
  question: z.string().min(1).max(2000),
  illustrations: z.boolean().optional().default(true),
  maxAttempts: z.number().int().min(1).max(10).optional(),
})

type RelationalCreds = PostgresCredentials | MySQLCredentials

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  const uid = auth.uid

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { sessionId, connectionId, question, illustrations, maxAttempts } = parsed.data

  const [session, connection] = await Promise.all([
    getSession(uid, sessionId),
    getConnection(uid, connectionId),
  ])
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  if (connection.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'Connection is not active. Test it first.' },
      { status: 409 },
    )
  }

  const schema: SchemaInfo = connection.schema ?? { tables: [] }
  const connector = getConnector(connection.type)
  const conn = connection

  // Cache the parsed file once so the agent loop doesn't re-read it on retries.
  type ParsedFile = { columns: string[]; rows: Record<string, unknown>[] }
  let fileCache: { parsed: ParsedFile; meta: FileConnectionMeta } | null = null
  async function loadFile(): Promise<{ parsed: ParsedFile; meta: FileConnectionMeta }> {
    if (fileCache) return fileCache
    if (connector.kind !== 'file') throw new Error('Not a file connection')
    if (!conn.fileObjectKey) throw new Error('File is missing from storage')
    const buffer = await downloadBuffer(conn.fileObjectKey)
    const parsed = connector.parseFile(buffer, conn.type === 'CSV' ? 'CSV' : 'EXCEL')
    const meta = conn.credentials as unknown as FileConnectionMeta
    fileCache = { parsed, meta }
    return fileCache
  }

  const execute = async (plan: QueryPlan) => {
    if (connector.kind === 'relational') {
      const sql = compileToSQL(plan)
      sanitizeSQL(sql)
      const res = await connector.execute(
        connection.credentials as unknown as RelationalCreds,
        sql,
      )
      return { compiledQuery: sql, ...res }
    }
    if (connector.kind === 'mongo') {
      const pipeline = compileToMongoPipeline(plan)
      sanitizePipeline(pipeline)
      const collection = plan.entities[0]
      if (!collection) throw new Error('MongoDB plan is missing a collection')
      const compiled = JSON.stringify({ collection, pipeline })
      const res = await connector.executePipeline(
        connection.credentials as unknown as MongoCredentials,
        collection,
        pipeline,
      )
      return { compiledQuery: compiled, rows: res.docs, rowCount: res.rowCount, durationMs: res.durationMs }
    }
    const sql = compileToSQL(plan)
    sanitizeSQL(sql)
    const { parsed: parsedFile, meta } = await loadFile()
    const res = await connector.queryTabular(meta.tableName, parsedFile, sql)
    return { compiledQuery: sql, ...res }
  }

  const attempts: AgentAttempt[] = []
  let agentResult
  try {
    agentResult = await runQueryAgent({
      question,
      schema,
      connectionType: connection.type,
      execute,
      maxAttempts,
      onAttempt: (a) => attempts.push(a),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Query failed'
    const status: 'BLOCKED' | 'FAILED' = /forbidden|not allowed|blocked|select only/i.test(message)
      ? 'BLOCKED'
      : 'FAILED'
    const lastAttempt = attempts[attempts.length - 1]
    await recordRun(uid, {
      sessionId,
      connectionId,
      connectionName: connection.name,
      question,
      compiledQuery: lastAttempt?.compiledQuery ?? null,
      status,
      errorMessage: message,
    })
    return NextResponse.json(
      { error: message, attempts: attempts.map(summarizeAttempt) },
      { status: 400 },
    )
  }

  const { rows, rowCount, durationMs, compiledQuery } = agentResult

  const redacted = redactSensitiveColumns(rows)
  const format = decideFormat(redacted, question, { illustrations })
  const summary = await summarizeResult(question, redacted, rowCount)

  const response: FormattedResponse = {
    kind: format.kind,
    chartSubtype: format.chartSubtype,
    chartConfig: format.chartConfig,
    summary,
    data: redacted,
  }

  const run = await recordRun(uid, {
    sessionId,
    connectionId,
    connectionName: connection.name,
    question,
    compiledQuery,
    status: 'SUCCESS',
    responseKind: response.kind.toUpperCase() as 'TEXT' | 'TABLE' | 'CHART',
    chartSubtype: response.chartSubtype?.toUpperCase() as 'BAR' | 'LINE' | 'PIE' | undefined,
    rowCount,
    durationMs,
  })

  await appendMessage(uid, sessionId, 'USER', {
    type: 'query',
    question,
    runId: run.id,
  })
  await appendMessage(uid, sessionId, 'ASSISTANT', {
    type: 'response',
    summary,
    responseKind: response.kind,
    chartSubtype: response.chartSubtype,
    chartConfig: response.chartConfig,
    data: response.data,
    compiledQuery: compiledQuery ?? undefined,
  })
  await touchSession(uid, sessionId)

  const result: QueryRunResult & { attempts: ReturnType<typeof summarizeAttempt>[] } = {
    runId: run.id,
    sessionId,
    compiledQuery,
    response,
    meta: { rowCount, durationMs },
    attempts: attempts.map(summarizeAttempt),
  }
  return NextResponse.json(result)
}

function summarizeAttempt(a: AgentAttempt) {
  return {
    attempt: a.attempt,
    compiledQuery: a.compiledQuery,
    error: a.error,
    rowCount: a.rowCount,
    durationMs: a.durationMs,
  }
}
