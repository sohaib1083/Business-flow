'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/firebase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const [error, setError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [oauthLoading, setOauthLoading] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setError(null)
    try {
      await signInWithEmail(data.email, data.password)
      router.replace('/chat')
    } catch (e) {
      setError(toAuthError(e))
    }
  }

  async function handleGoogle() {
    setOauthLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      router.replace('/chat')
    } catch (e) {
      setError(toAuthError(e))
    } finally {
      setOauthLoading(false)
    }
  }

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
      <CardHeader className="space-y-6 pb-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
            <span className="text-2xl font-bold text-primary-foreground">BF</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">Buisness Flow</h1>
            <p className="text-sm text-muted-foreground mt-1">Conversational analytics</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || oauthLoading}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-3 text-muted-foreground">or continue with</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={oauthLoading || isSubmitting}>
          {oauthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Google
        </Button>
      </CardContent>

      <CardFooter>
        <p className="text-sm text-muted-foreground mx-auto">
          New here?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

function toAuthError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code ?? ''
  if (code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-credential')) {
    return 'Invalid email or password.'
  }
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a minute.'
  return 'Sign-in failed. Please try again.'
}
