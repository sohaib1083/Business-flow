import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import {
  deleteSession,
  getSession,
  listMessages,
} from '@/lib/data/repos'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth

  const session = await getSession(auth.uid, params.id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = await listMessages(auth.uid, params.id)
  return NextResponse.json({ session, messages })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  await deleteSession(auth.uid, params.id)
  return NextResponse.json({ success: true })
}
