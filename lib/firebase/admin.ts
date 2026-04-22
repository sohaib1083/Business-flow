import 'server-only'
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage, type Storage } from 'firebase-admin/storage'

function buildApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (raw) {
    const parsed = JSON.parse(raw) as {
      project_id: string
      client_email: string
      private_key: string
    }
    return initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  }

  return initializeApp({
    credential: applicationDefault(),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

const app = buildApp()
export const adminAuth: Auth = getAuth(app)
export const adminDb: Firestore = getFirestore(app)
// Only allowed once per Firestore instance; guard against HMR re-runs.
const GLOBAL = globalThis as unknown as { __bfFirestoreSettingsApplied?: boolean }
if (!GLOBAL.__bfFirestoreSettingsApplied) {
  adminDb.settings({ ignoreUndefinedProperties: true })
  GLOBAL.__bfFirestoreSettingsApplied = true
}
export const adminStorage: Storage = getStorage(app)
