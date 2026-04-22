import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { adminDb } from '@/lib/firebase/admin'
import type {
  DataConnectionDoc,
  QueryMessageDoc,
  QueryRunDoc,
  QuerySessionDoc,
  QueryRunStatus,
  QueryResponseKind,
} from './types'
import type { MessageContent, MessageRole } from '@/types/session'
import type { ConnectionStatus, ConnectionType, SchemaInfo } from '@/types/connection'

const db: Firestore = adminDb

const now = () => new Date().toISOString()

/* ─────────────────────────  Connections  ─────────────────────── */

function connectionsCol(uid: string) {
  return db.collection('users').doc(uid).collection('connections')
}

export async function listConnections(uid: string): Promise<DataConnectionDoc[]> {
  const snap = await connectionsCol(uid).orderBy('createdAt', 'desc').get()
  return snap.docs.map((d) => d.data() as DataConnectionDoc)
}

export async function getConnection(uid: string, id: string): Promise<DataConnectionDoc | null> {
  const snap = await connectionsCol(uid).doc(id).get()
  return snap.exists ? (snap.data() as DataConnectionDoc) : null
}

export async function createConnection(
  uid: string,
  input: {
    name: string
    type: ConnectionType
    credentials: Record<string, unknown>
    schema?: SchemaInfo | null
    fileObjectKey?: string | null
    fileSizeBytes?: number | null
    status?: ConnectionStatus
  },
): Promise<DataConnectionDoc> {
  const id = randomUUID()
  const doc: DataConnectionDoc = {
    id,
    userId: uid,
    name: input.name,
    type: input.type,
    status: input.status ?? 'ACTIVE',
    credentials: input.credentials,
    schema: input.schema ?? null,
    glossary: null,
    fileObjectKey: input.fileObjectKey ?? null,
    fileSizeBytes: input.fileSizeBytes ?? null,
    lastTestedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  }
  await connectionsCol(uid).doc(id).set(doc)
  return doc
}

export async function updateConnection(
  uid: string,
  id: string,
  patch: Partial<DataConnectionDoc>,
): Promise<void> {
  await connectionsCol(uid).doc(id).update({ ...patch, updatedAt: now() })
}

export async function deleteConnection(uid: string, id: string): Promise<void> {
  await connectionsCol(uid).doc(id).delete()
}

/* ─────────────────────────  Sessions  ─────────────────────────── */

function sessionsCol(uid: string) {
  return db.collection('users').doc(uid).collection('sessions')
}

function messagesCol(uid: string, sessionId: string) {
  return sessionsCol(uid).doc(sessionId).collection('messages')
}

export async function listSessions(uid: string): Promise<QuerySessionDoc[]> {
  const snap = await sessionsCol(uid).orderBy('updatedAt', 'desc').limit(100).get()
  return snap.docs.map((d) => d.data() as QuerySessionDoc)
}

export async function getSession(uid: string, id: string): Promise<QuerySessionDoc | null> {
  const snap = await sessionsCol(uid).doc(id).get()
  return snap.exists ? (snap.data() as QuerySessionDoc) : null
}

export async function createSession(
  uid: string,
  connection: Pick<DataConnectionDoc, 'id' | 'name'>,
  title?: string,
): Promise<QuerySessionDoc> {
  const id = randomUUID()
  const doc: QuerySessionDoc = {
    id,
    userId: uid,
    connectionId: connection.id,
    connectionName: connection.name,
    title: title ?? null,
    messageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  }
  await sessionsCol(uid).doc(id).set(doc)
  return doc
}

export async function deleteSession(uid: string, id: string): Promise<void> {
  const batch = db.batch()
  const msgs = await messagesCol(uid, id).get()
  msgs.forEach((m) => batch.delete(m.ref))
  batch.delete(sessionsCol(uid).doc(id))
  await batch.commit()
}

export async function touchSession(
  uid: string,
  id: string,
  patch: Partial<Pick<QuerySessionDoc, 'title'>> = {},
): Promise<void> {
  await sessionsCol(uid).doc(id).update({
    ...patch,
    updatedAt: now(),
    messageCount: FieldValue.increment(2),
  })
}

/* ─────────────────────────  Messages  ─────────────────────────── */

export async function listMessages(uid: string, sessionId: string): Promise<QueryMessageDoc[]> {
  const snap = await messagesCol(uid, sessionId).orderBy('createdAt', 'asc').get()
  return snap.docs.map((d) => d.data() as QueryMessageDoc)
}

export async function appendMessage(
  uid: string,
  sessionId: string,
  role: MessageRole,
  content: MessageContent,
): Promise<QueryMessageDoc> {
  const id = randomUUID()
  const doc: QueryMessageDoc = { id, sessionId, role, content, createdAt: now() }
  await messagesCol(uid, sessionId).doc(id).set(doc)
  return doc
}

/* ─────────────────────────  Runs  ─────────────────────────────── */

function runsCol(uid: string) {
  return db.collection('users').doc(uid).collection('runs')
}

export async function recordRun(
  uid: string,
  input: {
    sessionId: string
    connectionId: string
    connectionName: string
    question: string
    compiledQuery?: string | null
    status: QueryRunStatus
    responseKind?: QueryResponseKind | null
    chartSubtype?: 'BAR' | 'LINE' | 'PIE' | null
    rowCount?: number | null
    durationMs?: number | null
    errorMessage?: string | null
  },
): Promise<QueryRunDoc> {
  const id = randomUUID()
  const doc: QueryRunDoc = {
    id,
    userId: uid,
    sessionId: input.sessionId,
    connectionId: input.connectionId,
    connectionName: input.connectionName,
    question: input.question,
    compiledQuery: input.compiledQuery ?? null,
    responseKind: input.responseKind ?? null,
    chartSubtype: input.chartSubtype ?? null,
    rowCount: input.rowCount ?? null,
    durationMs: input.durationMs ?? null,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    createdAt: now(),
  }
  await runsCol(uid).doc(id).set(doc)
  return doc
}

export async function listRuns(
  uid: string,
  opts: { limit?: number; connectionId?: string } = {},
): Promise<QueryRunDoc[]> {
  let query = runsCol(uid).orderBy('createdAt', 'desc') as FirebaseFirestore.Query
  if (opts.connectionId) query = query.where('connectionId', '==', opts.connectionId)
  query = query.limit(opts.limit ?? 50)
  const snap = await query.get()
  return snap.docs.map((d) => d.data() as QueryRunDoc)
}
