/**
 * Force a first-attempt failure to prove the agent self-heals.
 * We do this by calling the query route with a question that routinely trips
 * the LLM, and count the attempts.
 */
require('dotenv').config()

const APP_URL = process.env.APP_URL || 'http://localhost:3000'
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const EMAIL = process.env.TEST_EMAIL || 'demo@businessflow.test'
const PASSWORD = process.env.TEST_PASSWORD || 'Demo12345!'

async function signIn() {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  ).then((r) => r.json())
  if (!r.idToken) throw new Error(JSON.stringify(r))
  return r.idToken
}

async function api(token, method, path, body) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { body: json })
  return json
}

async function main() {
  const token = await signIn()
  const { connections } = await api(token, 'GET', '/api/connections')
  const conn = connections.find((c) => c.type === 'POSTGRES')
  if (!conn) throw new Error('No Postgres connection in this account')

  const { session } = await api(token, 'POST', '/api/sessions', {
    connectionId: conn.id,
    title: 'Retry demo',
  })

  // Vague / multi-hop questions that sometimes trip the model.
  const tricky = [
    'Compare revenue between the top-earning day and the average day this quarter',
    'What is the week-over-week transaction volume trend for the top country?',
    'Show me completed vs failed ratio per merchant category as percentages',
  ]

  for (const q of tricky) {
    const res = await api(token, 'POST', '/api/query', {
      sessionId: session.id,
      connectionId: conn.id,
      question: q,
      maxAttempts: 6,
    })
    const attempts = res.attempts || []
    const errs = attempts.filter((a) => a.error)
    console.log(`\nQ: ${q}`)
    console.log(`  -> ${res.response.kind}/${res.response.chartSubtype || '-'}  rows=${res.meta.rowCount}  dur=${res.meta.durationMs}ms`)
    console.log(`  attempts=${attempts.length}  errors=${errs.length}`)
    for (const e of errs) {
      console.log(`    #${e.attempt}: ${e.error.slice(0, 140)}`)
    }
    console.log(`  final SQL: ${res.compiledQuery?.slice(0, 200)}`)
  }
}

main().catch((e) => {
  console.error('FAIL', e.body || e.message || e)
  process.exit(1)
})
