import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import {
  createSession,
  deleteSession,
  getConnection,
  listSessions,
} from '@/lib/data/repos'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  const sessions = await listSessions(auth.uid)
  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth

  const body = await req.json().catch(() => null) as {
    connectionId?: string
    title?: string
  } | null
  if (!body?.connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
  }

  const connection = await getConnection(auth.uid, body.connectionId)
  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }
  if (connection.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Connection is not active' }, { status: 400 })
  }

  const session = await createSession(
    auth.uid,
    { id: connection.id, name: connection.name },
    body.title,
  )
  return NextResponse.json({ session })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await deleteSession(auth.uid, id)
  return NextResponse.json({ success: true })
}
