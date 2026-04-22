import type { ConnectionType, ConnectionStatus } from '@/types/connection'
import type { ChartConfig, QueryRunStatus } from '@/types/query'

export type { ConnectionType, ConnectionStatus, SchemaInfo } from '@/types/connection'

export interface DataConnection {
  id: string
  name: string
  type: ConnectionType
  status: ConnectionStatus
  lastTestedAt: string | null
  createdAt: string
  fileObjectKey?: string | null
  fileSizeBytes?: number | null
}

export interface QuerySession {
  id: string
  connectionId: string
  connectionName?: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export type MessageRole = 'USER' | 'ASSISTANT'

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'query'; question: string; runId: string }
  | {
    type: 'response'
    summary: string
    responseKind: 'text' | 'table' | 'chart'
    chartSubtype?: 'bar' | 'line' | 'pie'
    data: Record<string, unknown>[]
    chartConfig?: ChartConfig
    compiledQuery?: string
  }
  | { type: 'error'; message: string }

export interface QueryMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: MessageContent
  createdAt: string
}

export type { QueryRunStatus }
