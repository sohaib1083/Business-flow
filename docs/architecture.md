# Architecture

## Stack

| Layer               | Tech                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| Framework           | Next.js 14 (App Router, RSC), TypeScript                                |
| UI                  | React 18, Tailwind, Radix, Recharts, Framer Motion                      |
| Auth                | Firebase Authentication (client) + Firebase Admin (server verification) |
| Data (app state)    | Cloud Firestore                                                         |
| Data (file uploads) | Firebase Storage                                                        |
| LLM                 | Groq — `llama-3.3-70b-versatile`                                        |
| DB connectors       | `pg`, `mysql2`, `mongoose`                                              |
| File connector      | `papaparse`, `xlsx`, in-memory `duckdb`                                 |

## Folder map

```
app/
  (auth)/       login, signup
  (dashboard)/  chat, connections, history, settings (client-guarded)
  api/          server routes — all gated by requireUser()
components/
  chat/         conversation UI
  connections/  connection CRUD UI
  landing/      marketing page
  layout/       sidebar
  ui/           shadcn-style primitives
lib/
  ai/           Groq wrapper + planning/summarization
  data/         Firestore types + repos (one user → many connections/sessions)
  db/           connector router + SQL/pipeline sanitizers + schema introspection
  files/        Firebase Storage helper
  firebase/     client + admin SDKs + auth context + API auth helper
  security/     PII redaction for LLM payloads
  store/        Zustand chat store (authFetch wrapper lives here)
types/          shared TypeScript types
docs/           this folder
```

## Request lifecycle: "Ask a question"

```
 Browser (ChatInterface)
   │  authFetch POST /api/query { sessionId, connectionId, question, illustrations }
   ▼
 app/api/query/route.ts
   │  1. requireUser(req) — verify Firebase ID token
   │  2. Load session + connection from Firestore
   │  3. buildQueryPlan()      ── Groq, strict JSON output
   │  4. compileToSQL() or compileToMongoPipeline()
   │  5. sanitizeSQL() / sanitizePipeline() — reject non-SELECT / $out / $merge
   │  6. Route to connector (lib/db/router.ts):
   │       relational → pg / mysql2
   │       mongo      → mongoose
   │       file       → download from Storage → ephemeral DuckDB
   │  7. redactSensitiveColumns() on rows before sending to LLM
   │  8. decideFormat()   — text | table | chart (respects illustrations toggle)
   │  9. summarizeResult() — Groq, plain-English summary
   │ 10. recordRun() + appendMessage() in Firestore
   ▼
 Browser receives { runId, response: { kind, summary, data, chartConfig }, … }
```

## Firestore schema

All data is scoped to a single Firebase user (`uid`). There is no multi-tenant workspace layer.

```
users/{uid}
  connections/{connectionId}
    name, type, status, credentials, schema, glossary,
    fileObjectKey?, fileSizeBytes?, createdAt, lastTestedAt
  sessions/{sessionId}
    title, connectionId, messageCount, createdAt, updatedAt
    messages/{messageId}
      role: USER | ASSISTANT
      content: MessageContent   (text | query | response | error)
      createdAt
  runs/{runId}
    sessionId, connectionId, question, status,
    responseKind, rowCount, durationMs, compiledQuery,
    errorMessage?, createdAt
```

Credentials are stored as-is in Firestore. Firestore encrypts data at rest and only the authenticated user's service-account-authorized server can read them. If you need field-level encryption, add it in `lib/data/repos.ts` (`createConnection` / `getConnection`) — it's an intentional extension point.

## Auth flow

1. `AuthProvider` (in [lib/firebase/auth-context.tsx](../lib/firebase/auth-context.tsx)) subscribes to `onAuthStateChanged`.
2. The dashboard layout redirects to `/login` while no user is present.
3. Client requests attach the Firebase ID token: `Authorization: Bearer <token>` via the `authFetch` / `apiFetch` helpers.
4. Server routes call `requireUser(req)` ([lib/firebase/api-auth.ts](../lib/firebase/api-auth.ts)) which `verifyIdToken`s via the Admin SDK and returns `{ uid, email, ... }` or a 401 response.

## LLM touchpoints

There are only three places the LLM is involved:

1. **Planning** (`lib/ai/build-query-plan.ts`): takes the question + the cached connection schema, returns a structured `QueryPlan` (JSON mode, temperature 0). The plan is a neutral intermediate — independent of SQL vs MongoDB.
2. **Summarization** (`lib/ai/summarize-result.ts`): takes the redacted rows and returns one crisp paragraph. Falls back to a heuristic summary if Groq errors.
3. **No free-form SQL generation.** The model never writes raw SQL; `lib/ai/compile-query-plan.ts` does that deterministically from the plan. This keeps query behavior predictable and testable.

## Why ephemeral DuckDB for files

Each file query spins up a fresh in-memory DuckDB, creates a single table from the parsed rows, runs the SELECT, then closes the instance. No persistent file state means no stale data and no per-user DB files — trading a bit of CPU for simpler operations. See [lib/db/connectors/file-tabular.ts](../lib/db/connectors/file-tabular.ts).
