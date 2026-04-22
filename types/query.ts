export interface QueryPlan {
  sourceType: 'postgres' | 'mysql' | 'csv' | 'excel' | 'mongodb'
  intent: 'aggregate' | 'filter' | 'group' | 'timeseries' | 'ranking' | 'detail'
  entities: string[]
  fields: Array<{
    field: string
    agg?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count'
    alias?: string
  }>
  filters: Array<{
    field: string
    op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'between' | 'contains'
    value: unknown
  }>
  groupBy?: string[]
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>
  limit?: number
  joins?: Array<{
    table: string
    on: { left: string; right: string }
    type?: 'inner' | 'left'
  }>
  timeBucket?: {
    field: string
    unit: 'day' | 'week' | 'month' | 'quarter' | 'year'
    alias?: string
  }
}

export interface ChartConfig {
  xKey: string
  yKey: string
  title: string
  color?: string
}

export interface FormattedResponse {
  kind: 'text' | 'table' | 'chart'
  chartSubtype?: 'bar' | 'line' | 'pie'
  summary: string
  chartConfig?: ChartConfig
  data: Record<string, unknown>[]
}

export interface QueryRunResult {
  runId: string
  sessionId: string
  compiledQuery: string | null
  response: FormattedResponse
  meta: {
    rowCount: number
    durationMs: number
  }
}

export type QueryRunStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED'

export interface QueryHistoryEntry {
  id: string
  sessionId: string
  connectionId: string
  connectionName: string
  question: string
  status: QueryRunStatus
  responseKind: 'TEXT' | 'TABLE' | 'CHART' | null
  rowCount: number | null
  durationMs: number | null
  compiledQuery: string | null
  errorMessage: string | null
  createdAt: string
}
