import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import { createConnection, listConnections } from '@/lib/data/repos'
import { getConnector } from '@/lib/db/router'
import type {
  PostgresCredentials,
  MySQLCredentials,
  MongoCredentials,
} from '@/types/connection'

export const dynamic = 'force-dynamic'

const postgresSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().min(1).max(65535),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().optional().default(false),
})

const mysqlSchema = postgresSchema

const mongoSchema = z.object({
  uri: z.string().min(1),
  database: z.string().min(1),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['POSTGRES', 'MYSQL', 'MONGODB']),
  credentials: z.record(z.unknown()),
})

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  const connections = await listConnections(auth.uid)
  return NextResponse.json({ connections })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { name, type, credentials } = parsed.data

  try {
    const connector = getConnector(type)
    if (type === 'POSTGRES' || type === 'MYSQL') {
      const creds = (type === 'POSTGRES' ? postgresSchema : mysqlSchema).parse(
        credentials,
      ) as PostgresCredentials | MySQLCredentials
      if (connector.kind !== 'relational') throw new Error('unreachable')
      const test = await connector.test(creds)
      if (!test.success) {
        return NextResponse.json({ error: test.message }, { status: 400 })
      }
      const schema = await connector.introspect(creds)
      const saved = await createConnection(auth.uid, {
        name,
        type,
        credentials: creds as unknown as Record<string, unknown>,
        schema,
      })
      return NextResponse.json({ connection: saved }, { status: 201 })
    }

    if (type === 'MONGODB') {
      const creds = mongoSchema.parse(credentials) as MongoCredentials
      if (connector.kind !== 'mongo') throw new Error('unreachable')
      const test = await connector.test(creds)
      if (!test.success) {
        return NextResponse.json({ error: test.message }, { status: 400 })
      }
      const schema = await connector.introspect(creds)
      const saved = await createConnection(auth.uid, {
        name,
        type,
        credentials: creds as unknown as Record<string, unknown>,
        schema,
      })
      return NextResponse.json({ connection: saved }, { status: 201 })
    }

    return NextResponse.json({ error: 'Unsupported type' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create connection'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
