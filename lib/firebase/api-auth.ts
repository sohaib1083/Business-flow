import 'server-only'
import { NextResponse } from 'next/server'
import { adminAuth } from './admin'

export interface AuthContext {
  uid: string
  email: string | null
}

/** Verify the bearer ID token on an incoming API request. */
export async function requireUser(req: Request): Promise<AuthContext | NextResponse> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email ?? null }
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}

export function isAuthResponse(value: AuthContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}
