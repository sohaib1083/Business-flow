import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth } from '@/lib/firebase/admin'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { name, email, password } = parsed.data

    await adminAuth.createUser({
      email,
      password,
      displayName: name,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? ''
    if (code.includes('email-already-exists')) {
      return NextResponse.json({ error: 'EMAIL_EXISTS' }, { status: 409 })
    }

    return NextResponse.json({ error: 'SIGNUP_FAILED' }, { status: 500 })
  }
}
