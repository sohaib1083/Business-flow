import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import { deleteConnection, getConnection } from '@/lib/data/repos'
import { deleteObject } from '@/lib/files/storage'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  const connection = await getConnection(auth.uid, params.id)
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ connection })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  const connection = await getConnection(auth.uid, params.id)
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (connection.fileObjectKey) {
    await deleteObject(connection.fileObjectKey).catch(() => undefined)
  }
  await deleteConnection(auth.uid, params.id)
  return NextResponse.json({ success: true })
}
