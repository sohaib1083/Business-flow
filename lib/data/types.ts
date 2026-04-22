/**
 * Firestore document shapes. Each user owns their own data; there is no
 * workspace layer.
 *
 *   users/{uid}
 *   users/{uid}/connections/{connectionId}
 *   users/{uid}/sessions/{sessionId}
 *   users/{uid}/sessions/{sessionId}/messages/{messageId}
 *   users/{uid}/runs/{runId}
 */

import type { ConnectionType, ConnectionStatus, SchemaInfo } from '@/types/connection'
import type { MessageContent, MessageRole } from '@/types/session'

export interface DataConnectionDoc {
  id: string
  userId: string
  name: string
  type: ConnectionType
  status: ConnectionStatus
  credentials: Record<string, unknown>
  schema: SchemaInfo | null
  glossary: string | null
  fileObjectKey: string | null
  fileSizeBytes: number | null
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface QuerySessionDoc {
  id: string
  userId: string
  connectionId: string
  connectionName: string
  title: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface QueryMessageDoc {
  id: string
  sessionId: string
  role: MessageRole
  content: MessageContent
  createdAt: string
}

export type QueryRunStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED'
export type QueryResponseKind = 'TEXT' | 'TABLE' | 'CHART'

export interface QueryRunDoc {
  id: string
  userId: string
  sessionId: string
  connectionId: string
  connectionName: string
  question: string
  compiledQuery: string | null
  responseKind: QueryResponseKind | null
  chartSubtype: 'BAR' | 'LINE' | 'PIE' | null
  rowCount: number | null
  durationMs: number | null
  status: QueryRunStatus
  errorMessage: string | null
  createdAt: string
}
