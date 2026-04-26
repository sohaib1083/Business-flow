# Architecture

```
┌─────────────────┐     POST /api/query      ┌────────────────────────┐
│  Next.js (3000) │ ───────────────────────▶ │  FastAPI (8000)        │
│  Chat UI        │ ◀─── narrative + chart ─ │  pipeline orchestrator │
└─────────────────┘                          └─────────┬──────────────┘
                                                       │
              ┌────────────────────────────────────────┴────────────────┐
              ▼                  ▼               ▼                ▼
        intent.py         discovery.py      sql_gen.py        insight.py
       (LLM, Groq)       (LLM, Groq)      (LLM + sqlparse)   (LLM, Groq)
              │                  │               │                ▲
              └──── parsed ──────┴── tables ─────┴───── SQL ──────┤
                                                                  │
                                                       ┌──────────┴───────────┐
                                                       │  executor.py         │
                                                       │  SQLAlchemy engine   │
                                                       │  per connection_id   │
                                                       └──────────┬───────────┘
                                                                  │
                                              ┌───────────────────┼───────────────────┐
                                              ▼                   ▼                   ▼
                                          SQLite              PostgreSQL            MySQL
                                          (demo)              (psycopg2)            (PyMySQL)
                                  ▲
                                  │  metrics + history
                                  ▼
                            storage.py  ──▶  Firebase Firestore
                                          ▶  local_store.json (fallback)
```

## The 9 stages

| # | Module | Responsibility |
|---|---|---|
| 0 | `services/schema.py` | Introspect tables/columns/FKs/sample rows; cached |
| 1 | `services/intent.py` | LLM extracts metric / dimensions / filters / time range |
| 2 | `services/discovery.py` | LLM picks the minimum set of tables to answer |
| 3 | `services/semantic.py` | Pull reusable metric definitions from storage |
| 4 | `services/sql_gen.py` | LLM writes SQL, then we **validate** before execution |
| 5 | `services/sql_gen.validate_sql` | Reject non-SELECT, unknown tables, forbidden keywords; auto-add LIMIT |
| 6 | `services/executor.py` | SQLAlchemy executes against the demo SQLite DB |
| 7 | `services/insight.py` | LLM converts result rows → narrative + chart hint |
| 8 | `services/semantic.remember_metric` | Persist newly-learned metric formulas |
| 9 | `services/storage.log_query` | Append the full query trace to history |

`services/pipeline.py` glues them together. Every stage's output is captured
under `result.stages.*` so you can inspect what happened in the OpenAPI UI.

## Why these tech choices

- **Groq** for LLM: ~10× lower latency than OpenAI, sub-second responses
  matter for chat UX. Cost per query ≈ $0.001.
- **FastAPI + Pydantic v2**: typed, async-ready, free OpenAPI docs.
- **SQLAlchemy + sqlparse**: the dialect-agnostic combo for safely running
  generated SQL. SQLite for the demo, but the same code works against
  Postgres / MySQL by changing the URL.
- **Firebase Firestore** for the learning store: zero ops to start, and
  real-time updates make the metrics panel feel alive. We have a clear
  migration path to Postgres+Redis at scale (see [PLANNING.md](../PLANNING.md)).
- **Next.js 14 app router + Recharts**: fast to ship, works server- or
  client-rendered, charts have zero config.

## Extending to a real customer database

Already done — the platform ships with a multi-DB connector layer
(SQLite, PostgreSQL, MySQL). See [connections.md](connections.md) for the
full writeup. Key pieces:

- **`services/connections.py`** — connection registry. Stores host /
  port / db / user plus a **Fernet-encrypted password** in Firebase or
  the local-JSON fallback.
- **`services/schema.py`** — keeps a per-`connection_id` engine and
  schema cache (`pool_pre_ping=True`, `threading.Lock`-protected).
  Identifiers are quoted via the engine's own dialect preparer so
  PostgreSQL case-folding and MySQL backticks just work.
- **`services/sql_gen.py`** — the system prompt is built per dialect
  from a `_DIALECT_INFO` map (date functions, identifier rules). The
  validator's table allowlist is computed live from the active
  connection's schema.
- **`pipeline.run_query(query, connection_id=...)`** — the only change
  to the orchestrator. Every stage receives the connection id; the
  result echoes it back for traceability.

Adding a new dialect (SQL Server, Snowflake, BigQuery) is a 5-line patch
in those four files — see the bottom of [connections.md](connections.md).
