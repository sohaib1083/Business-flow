import { NextResponse } from 'next/server'

// All auth is handled at the API-route level via Firebase ID token
// verification. Middleware is a no-op placeholder.
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
