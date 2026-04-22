'use client'

import * as React from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { firebaseAuth } from './client'

interface AuthContextValue {
  user: User | null
  initializing: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string | null>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [initializing, setInitializing] = React.useState(true)

  React.useEffect(() => {
    return onIdTokenChanged(firebaseAuth, (next) => {
      setUser(next)
      setInitializing(false)
    })
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      async signInWithEmail(email, password) {
        await signInWithEmailAndPassword(firebaseAuth, email, password)
      },
      async signUpWithEmail(name, email, password) {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password)
        if (name) await updateProfile(cred.user, { displayName: name })
      },
      async signInWithGoogle() {
        await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
      },
      async signOut() {
        await fbSignOut(firebaseAuth)
      },
      async getIdToken() {
        return firebaseAuth.currentUser ? firebaseAuth.currentUser.getIdToken() : null
      },
    }),
    [user, initializing],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/** Authenticated fetch wrapper that attaches the current user's ID token. */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const current = firebaseAuth.currentUser
  const token = current ? await current.getIdToken() : null
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
