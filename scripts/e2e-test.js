/* eslint-disable no-console */
/**
 * End-to-end smoke test:
 *   1. Create or log in a Firebase user via the public Identity Toolkit REST API.
 *   2. Hit our Next.js API with the ID token:
 *        - POST /api/connections       (create a Postgres connection)
 *        - POST /api/connections/:id/test
 *        - POST /api/query             (ask a natural-language question)
 *        - GET  /api/history
 *
 * Env used:
 *   NEXT_PUBLIC_FIREBASE_API_KEY, APP_URL (default http://localhost:3000),
 *   TEST_EMAIL, TEST_PASSWORD, PG_HOST, PG_PORT, PG_DB, PG_USER, PG_PASSWORD
 */
require('dotenv').config()

const APP_URL = process.env.APP_URL || 'http://localhost:3000'
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const EMAIL = process.env.TEST_EMAIL || 'demo@businessflow.test'
const PASSWORD = process.env.TEST_PASSWORD || 'Demo12345!'

const PG = {
  host: process.env.PG_HOST || '127.0.0.1',
  port: Number(process.env.PG_PORT || 5433),
  database: process.env.PG_DB || 'finance',
  user: process.env.PG_USER || 'demo',
  password: process.env.PG_PASSWORD || 'demo',
  ssl: false,
}

function log(step, data) {
  console.log(`\n--- ${step} ---`)
  if (typeof data === 'string') console.log(data)
  else console.log(JSON.stringify(data, null, 2).slice(0, 800))
}

async function firebaseAuth() {
  const signUp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  ).then((r) => r.json())

  if (signUp.idToken) {
    log('firebase signup', { uid: signUp.localId, email: signUp.email })
    return signUp.idToken
  }

  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  ).then((r) => r.json())

  if (!signIn.idToken) {
    throw new Error(`Firebase auth failed: ${JSON.stringify(signUp.error || signIn.error)}`)
  }
  log('firebase signin', { uid: signIn.localId, email: signIn.email })
  return signIn.idToken
}

async function api(token, method, path, body) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

async function main() {
  if (!API_KEY) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY missing in .env')

  const token = await firebaseAuth()

  // 1. Create Postgres connection
  const created = await api(token, 'POST', '/api/connections', {
    name: 'Demo Finance DB',
    type: 'POSTGRES',
    credentials: PG,
  })
  log('connection created', created)
  const connectionId = created.connection?.id || created.id
  if (!connectionId) throw new Error('No connection id returned')

  // 2. Test connection
  const tested = await api(token, 'POST', `/api/connections/${connectionId}/test`, {})
  log('connection tested', tested)

  // 2b. Create a chat session
  const sessionRes = await api(token, 'POST', '/api/sessions', {
    connectionId,
    title: 'E2E demo session',
  })
  const sessionId = sessionRes.session?.id || sessionRes.id
  log('session created', { sessionId })

  // 3. Ask a question
  const questions = [
    'What is the total revenue from completed transactions in the last 30 days?',
    'Top 5 merchants by total completed transaction amount',
    'How many transactions per country?',
    'Show me total revenue by month this year',
    'Transaction count per payment method',
    'Which country had the highest growth in transactions between this month and last month?',
    'Average ticket size per merchant category',
  ]
  for (const q of questions) {
    try {
      const answer = await api(token, 'POST', '/api/query', {
        sessionId,
        connectionId,
        question: q,
      })
      log(`query: ${q}`, {
        kind: answer.response?.kind,
        chartSubtype: answer.response?.chartSubtype,
        summary: answer.response?.summary,
        rowCount: answer.meta?.rowCount,
        durationMs: answer.meta?.durationMs,
        compiledQuery: answer.compiledQuery,
        attempts: answer.attempts?.length,
        attemptErrors: (answer.attempts || [])
          .filter((a) => a.error)
          .map((a) => `#${a.attempt}: ${a.error.slice(0, 120)}`),
        rowsPreview: (answer.response?.data || []).slice(0, 3),
      })
    } catch (err) {
      log(`query FAILED: ${q}`, String(err.message || err))
    }
  }

  // 4. History
  const history = await api(token, 'GET', '/api/history?limit=10')
  log('history (first 3)', (history.entries || history).slice?.(0, 3) || history)

  console.log('\n=== E2E OK ===')
}

main().catch((e) => {
  console.error('\n!!! E2E FAILED:', e.message || e)
  process.exit(1)
})
