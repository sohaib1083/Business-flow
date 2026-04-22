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

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(50),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type FormData = z.infer<typeof schema>

export default function SignupPage() {
  const router = useRouter()
  const { signUpWithEmail, signInWithGoogle } = useAuth()
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
      await signUpWithEmail(data.name, data.email, data.password)
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
            <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">Start analysing your data in minutes</p>
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
            <Label htmlFor="name">Full name</Label>
            <Input id="name" autoComplete="name" placeholder="Jane Doe" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

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
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || oauthLoading}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create account
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
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

function toAuthError(e: unknown): string {
  const message = (e as { message?: string } | null)?.message ?? ''
  const code = (e as { code?: string } | null)?.code ?? ''
  if (code.includes('email-already-in-use')) return 'This email is already registered. Try signing in.'
  if (code.includes('weak-password')) return 'Password is too weak. Use at least 8 characters.'
  if (code.includes('operation-not-allowed')) return 'Email/password sign-up is disabled in Firebase Authentication settings.'
  if (code.includes('invalid-api-key')) return 'Firebase API key is invalid. Check NEXT_PUBLIC_FIREBASE_API_KEY.'
  if (message.includes('signup-fallback-failed')) return 'Sign-up service is unavailable right now. Please try again in a minute.'
  return code ? `Sign-up failed (${code}). Please try again.` : 'Sign-up failed. Please try again.'
}
