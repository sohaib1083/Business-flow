import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import { listRuns } from '@/lib/data/repos'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth
  const url = new URL(req.url)
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50))
  const connectionId = url.searchParams.get('connectionId') ?? undefined
  const entries = await listRuns(auth.uid, { limit, connectionId })
  return NextResponse.json({ entries })
}
