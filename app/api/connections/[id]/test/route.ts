import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import { getConnection, updateConnection } from '@/lib/data/repos'
import { getConnector } from '@/lib/db/router'
import type {
  PostgresCredentials,
  MySQLCredentials,
  MongoCredentials,
} from '@/types/connection'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth

  const connection = await getConnection(auth.uid, params.id)
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const connector = getConnector(connection.type)
    const now = new Date().toISOString()

    if (connector.kind === 'relational') {
      const result = await connector.test(
        connection.credentials as unknown as PostgresCredentials | MySQLCredentials,
      )
      await updateConnection(auth.uid, params.id, {
        status: result.success ? 'ACTIVE' : 'ERROR',
        lastTestedAt: now,
      })
      return NextResponse.json(result)
    }

    if (connector.kind === 'mongo') {
      const result = await connector.test(connection.credentials as unknown as MongoCredentials)
      await updateConnection(auth.uid, params.id, {
        status: result.success ? 'ACTIVE' : 'ERROR',
        lastTestedAt: now,
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ success: true, message: 'File connections are always available.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test failed'
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
