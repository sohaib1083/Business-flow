# Security

This is a demo, not a production system. Below are the controls already in
place and the gaps you must close before exposing it to real users.

## What's already enforced

### SQL safety (the biggest risk)
Every LLM-generated statement goes through `services/sql_gen.validate_sql`
before execution. We enforce:

- **Single statement only.** Multiple statements via `;` are rejected.
- **SELECT (or WITH … SELECT) only.** `INSERT/UPDATE/DELETE/DROP/TRUNCATE/
  ALTER/CREATE/GRANT/REVOKE/ATTACH/DETACH/PRAGMA/REPLACE/VACUUM` are all
  rejected by keyword scan.
- **Table allowlist.** `FROM` and `JOIN` targets must exist in the
  introspected schema. Hallucinated tables fail closed.
- **Auto-LIMIT.** Any statement without a `LIMIT` clause gets one
  (`max_rows_returned`, default 10,000) injected.
- **Read-only by construction.** The pipeline has no code path that mutates
  data; it only ever calls `connection.execute(SELECT...)`.

### Secret handling
- All credentials are loaded from the repo-root `.env` via
  `pydantic-settings`. The file is in `.gitignore`.
- The Firebase service-account JSON is never logged.
- LLM prompt logs (`groq call: prompt=…`) include token counts only, not
  prompt contents.

### Connection credentials at rest
When a user adds a PostgreSQL or MySQL connection through the UI / API,
the password is encrypted with **Fernet (AES-128-CBC + HMAC-SHA256)**
before being written to the storage backend (Firebase or local JSON).

- The encryption key lives at `backend/.encryption.key`, generated on
  first use, and is excluded from git via `.gitignore`.
- API responses **never** include the password — only a `has_password`
  boolean flag.
- **Key rotation:** deleting `.encryption.key` invalidates every stored
  password. Users must re-enter credentials. There is no in-place
  re-encryption flow yet — add one before scaling beyond a handful of
  connections.
- For production, replace the local file with **AWS KMS / GCP KMS /
  Azure Key Vault** envelope encryption — Fernet is fine for the demo
  but does not give you per-tenant key isolation or audit trails.

### Data minimisation
- Only the **first 25 result rows** are sent to the insight LLM. For
  aggregate queries this is usually all of them; for raw row queries it
  bounds PII exposure.
- Query history stores SQL + metadata, not result rows.

## What you MUST add before production

| Risk | Control |
|---|---|
| Customer DB credentials in plain `.env` | Encrypt at rest with KMS; per-workspace IAM |
| Read-only DB role not enforced at the DB | Provision a `readonly` role on the customer DB and connect with it |
| No query timeout enforced (config exists, executor doesn't apply yet) | Add `statement_timeout` for Postgres / `MAX_EXECUTION_TIME` for MySQL |
| No rate limiting per workspace | Add Redis-based limiter at the FastAPI layer |
| No auth on the API | Add Clerk / Firebase Auth + JWT verification middleware |
| Service-account JSON visible in chat history | **Rotate immediately**; future deploys load from a secret manager |
| CORS allows all methods/headers | Tighten to specific frontend origin in production |
| LLM prompt-injection via column names or sample data | Sanitize / truncate sample rows before injecting; never run SQL the user wrote directly |

## Threat model summary

The single highest-impact attack class is **prompt injection causing
malicious SQL**. The defence-in-depth answer:
1. Constrain SQL generation to known schema (we do this).
2. Validate AST + keyword-deny before execution (we do this).
3. Connect with a read-only DB user (you must do this).
4. Run with low statement timeouts (you must do this).
5. Audit-log every executed SQL statement (we do this in the history store).

Even if all earlier layers fail, layers 3–4 prevent damage.
