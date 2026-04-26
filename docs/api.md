# API reference

Base URL: `http://localhost:8000`

All endpoints return JSON. The interactive OpenAPI UI is at `/docs`.

---

## `POST /api/query`

Run the natural-language → insight pipeline.

**Request**
```json
{
  "query": "What is total revenue by country?",
  "workspace_id": "demo",
  "connection_id": "demo"
}
```

`connection_id` is optional and defaults to `"demo"` (the built-in SQLite
sample DB). Pass the id of any saved connection (see
[connections.md](connections.md)) to run the same NL pipeline against
your PostgreSQL or MySQL database. The response echoes back
`connection_id` for traceability.

**Response (success)**
```json
{
  "id": "f3e9...",
  "query": "What is total revenue by country?",
  "workspace_id": "demo",
  "ok": true,
  "narrative": "Revenue is concentrated in the USA ($24,310) and UK ($18,402)...",
  "chart": { "type": "bar", "x": "country", "y": "revenue", "title": "Revenue by country" },
  "sql": "SELECT customers.country, SUM(orders.amount) AS revenue ...",
  "columns": ["country", "revenue"],
  "rows": [{ "country": "USA", "revenue": 24310.45 }, ...],
  "row_count": 8,
  "tables_used": ["orders", "customers"],
  "execution_ms": 6,
  "total_ms": 1843,
  "learned_metric": {
    "name": "revenue",
    "sql_fragment": "SUM(orders.amount)",
    "status": "suggested",
    "usage_count": 1
  },
  "stages": { "intent": {...}, "discovery": {...}, ... }
}
```

**Response (failure)** — same shape, with `ok: false` and an `error` field. Common causes:
- `error: "Could not identify any relevant tables..."` → schema doesn't fit the question.
- `error: "SQL blocked by safety check: ..."` → generated SQL was non-SELECT or referenced unknown tables.
- `error: "no such column: ..."` → LLM hallucinated a column; the safety net caught it post-execution.

---

## `GET /api/schema`

Introspected schema of a connected database. Accepts an optional
`connection_id` query parameter (defaults to `demo`).

```
GET /api/schema?connection_id=pg-prod
```

Returns:
```json
{
  "connection_id": "pg-prod",
  "dialect": "postgresql",
  "tables": { "customers": [...], "orders": [...] },
  "count": 5
}
```

---

## `GET /api/connections`

List all saved datasource connections (passwords redacted).

```json
{
  "connections": [
    { "id": "demo", "name": "Built-in demo", "dialect": "sqlite", "is_demo": true, ... },
    { "id": "pg-prod", "name": "Production", "dialect": "postgresql", "host": "db.example.com", "has_password": true, ... }
  ],
  "count": 2
}
```

## `POST /api/connections`

Create a new connection. The server runs `SELECT 1` against it before
persisting and returns the test result alongside the saved record.

```json
{
  "name": "Production",
  "dialect": "postgresql",
  "host": "db.example.com",
  "port": 5432,
  "database": "analytics",
  "username": "readonly",
  "password": "...",
  "ssl": true
}
```

Response `201`:
```json
{
  "connection": { "id": "production", "dialect": "postgresql", "has_password": true, ... },
  "test": { "ok": true, "dialect": "postgresql" }
}
```

## `DELETE /api/connections/{id}`

Removes a saved connection. The built-in `demo` id is locked (returns 400).

## `POST /api/connections/test`

Test arbitrary credentials without saving them. Same body as create.

## `POST /api/connections/{id}/test`

Re-test the credentials of an already saved connection.

---

## `GET /api/metrics?workspace_id=demo`

List learned semantic metrics, sorted by usage. Each has `status: "suggested" | "approved"`.

---

## `POST /api/metrics/approve`
```json
{ "name": "revenue", "workspace_id": "demo" }
```
Promote a learned metric to `approved`. Approved metrics are preferred during SQL generation.

---

## `GET /api/history?workspace_id=demo&limit=20`

Return the most recent query traces.

---

## `GET /api/suggestions`

Static demo suggestions. Replace with a learned/embedding-based suggester in v0.4.

---

## `GET /api/storage/info`

Returns `{"backend": "firebase"}` or `{"backend": "local-json"}` so the UI can
show which mode is active.
