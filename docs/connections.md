# Database Connections

BusinessFlow ships with a **built-in SQLite demo connection** so you can try
the system immediately, but the real value is connecting it to your own
operational database. The connector layer supports:

| Dialect    | Driver           | Default port |
| ---------- | ---------------- | ------------ |
| SQLite     | built-in         | n/a          |
| PostgreSQL | `psycopg2-binary`| 5432         |
| MySQL      | `PyMySQL`        | 3306         |

## How it works

1. **Registry** (`app/services/connections.py`) — owns the list of saved
   datasources. Each record contains host/port/database/user plus an
   **encrypted password** (Fernet AES-128 + HMAC, key in
   `backend/.encryption.key`).
2. **Storage** — connections persist via the same Firebase / local-JSON
   adapter used for metrics. Survive restarts without configuration.
3. **Engine cache** (`app/services/schema.py`) — one cached SQLAlchemy
   engine per `connection_id`, with `pool_pre_ping=True` to recover from
   stale TCP connections. Cache is invalidated on create/update/delete.
4. **Dialect-aware SQL generation** (`app/services/sql_gen.py`) — the LLM
   system prompt is rewritten per dialect with the right date/time
   functions and identifier-quoting hints (PostgreSQL uses `DATE_TRUNC`,
   MySQL uses `DATE_FORMAT`, etc).
5. **Same safety pipeline** — SELECT-only check, table allowlist, forbidden
   keyword scan, automatic `LIMIT` injection. The allowlist is recomputed
   per connection from live introspection, so users can't reference tables
   that aren't in *their* DB.

## REST API

| Method | Path                                  | Purpose                              |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/api/connections`                    | List all (passwords redacted)        |
| POST   | `/api/connections`                    | Create + auto-test a new connection  |
| DELETE | `/api/connections/{id}`               | Remove a saved connection            |
| POST   | `/api/connections/test`               | Test arbitrary creds (no save)       |
| POST   | `/api/connections/{id}/test`          | Re-test a saved connection           |
| GET    | `/api/schema?connection_id=…`         | Introspected schema for a connection |
| POST   | `/api/query` (with `connection_id`)   | Run a question against any saved DB  |

### Example: add a Postgres connection

```bash
curl -X POST http://localhost:8000/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Analytics",
    "dialect": "postgresql",
    "host": "db.example.com",
    "port": 5432,
    "database": "analytics",
    "username": "readonly_user",
    "password": "***",
    "ssl": true
  }'
```

The response includes `connection.id` (slugified from name) and a `test`
block proving the credentials worked. Use that id in subsequent
`/api/query` calls:

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"top 10 customers by revenue","connection_id":"production-analytics"}'
```

## UI

The **Connections** panel in the right sidebar of the home page lets you:

- Switch the active connection with one click (highlighted in brand
  colour).
- Add a new SQLite / PostgreSQL / MySQL connection with a small inline
  form. The form runs a live `SELECT 1` health-check before persisting.
- Delete user-defined connections (the built-in `demo` is locked).

A coloured pill next to each entry shows the dialect at a glance.

## Security model

- **Read-only is enforced at the SQL layer**, not at the connection layer.
  We strongly recommend you provision a dedicated read-only DB user when
  creating connections — the platform won't be the only line of defence.
- Passwords are encrypted at rest. The encryption key is generated on
  first use at `backend/.encryption.key` and is excluded from git.
  **Treat it like a private key**: rotate by deleting the file and
  re-entering all passwords.
- Bad credentials surface a clean error from the driver instead of a
  stack trace.
- Failures of the storage backend (Firebase) never block query execution
  — the local JSON fallback takes over silently.

## Adding more dialects

To support e.g. SQL Server or Snowflake:

1. Add the SQLAlchemy driver to `backend/requirements.txt`.
2. Add the literal name (`mssql`, `snowflake`) to `SUPPORTED_DIALECTS`
   and `Dialect` in `connections.py`.
3. Extend `build_url()` with the right URL scheme.
4. Add a `_DIALECT_INFO` entry in `sql_gen.py` describing the dialect's
   date functions and quoting rules.
5. Add a smoke test to `test_connectors.ps1`.

The pipeline itself is dialect-agnostic — these five spots are all the
plumbing that needs touching.
