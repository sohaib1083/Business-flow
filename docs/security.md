# Security

A short, honest inventory.

## Authentication

- All `/api/*` routes call `requireUser(req)` from [lib/firebase/api-auth.ts](../lib/firebase/api-auth.ts), which verifies a Firebase ID token from the `Authorization: Bearer …` header via `adminAuth.verifyIdToken`.
- Client code never calls `fetch` directly against our API — it goes through `apiFetch` / `authFetch` which attach the current user's ID token.
- The dashboard layout is client-guarded: unauthenticated users are redirected to `/login` before any protected UI mounts.
- There is no server-side cookie/session. If the Firebase token is invalid or expired, the API returns 401 and the client refreshes or redirects.

## Data isolation

- Every Firestore write is scoped under `users/{uid}/…`. A user's `uid` comes from the verified ID token — it cannot be spoofed by the client.
- Firebase Storage uploads go to `users/{uid}/uploads/…`. Client-side Firestore and Storage rules are locked down to `false` — all reads/writes must come through the server.

## Read-only queries

- **SQL**: [lib/db/sanitize-sql.ts](../lib/db/sanitize-sql.ts) parses the compiled query and rejects anything that isn't a single top-level `SELECT`. `INSERT`, `UPDATE`, `DELETE`, `DROP`, multi-statement blocks, and comments that could smuggle in writes are all rejected.
- **MongoDB**: [lib/db/sanitize-pipeline.ts](../lib/db/sanitize-pipeline.ts) strips write stages (`$out`, `$merge`, `$function` with side effects) and caps the pipeline length.
- Connection credentials provided by the user should themselves be read-only database users. The app enforces this at the query layer, but defense in depth on your DB side is strongly recommended.

## LLM payload redaction

Before rows are sent to Groq for summarization, [lib/security/redact.ts](../lib/security/redact.ts) redacts values whose column names match patterns like `email`, `phone`, `ssn`, `password`, `api_key`, etc. Only the first ~50 rows are forwarded — enough to write a summary, not enough to exfiltrate a dataset.

## Secrets

- `FIREBASE_SERVICE_ACCOUNT_JSON` and `GROQ_API_KEY` must be set server-side only. They are never exposed via `NEXT_PUBLIC_*`.
- `lib/firebase/admin.ts` is marked `'server-only'` — importing it from a client component will fail the build.

## What's intentionally _not_ here

- **Credential field-level encryption.** Connection credentials are stored in Firestore as-is. Firestore encrypts at rest and only the user's authorized server can read them. If you need envelope encryption on top, extend `createConnection` / `getConnection` in [lib/data/repos.ts](../lib/data/repos.ts).
- **Rate limiting.** There is no per-user query throttle. If you expect abuse, front the API with a gateway (e.g. Cloud Armor, Vercel firewall) or add a token-bucket check in `requireUser`.
- **Row-level encryption of query results.** Results are streamed back to the requesting user only; they are not persisted in Firestore beyond the summarized response + metadata stored in `runs/`.

## Reporting a vulnerability

Open a private issue or email the maintainers. Please do not include credentials or customer data in reports.
