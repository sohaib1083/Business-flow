# Data sources

Buisness Flow routes every question through a single `getConnector(type)` function in [lib/db/router.ts](../lib/db/router.ts) that returns a discriminated union:

```ts
type Connector =
  | { kind: 'relational'; test, execute, introspect }   // pg, mysql
  | { kind: 'mongo';      test, executePipeline, introspect }
  | { kind: 'file';       parseCsv, parseExcel, queryTabular, … }
```

This keeps the query pipeline small — it compiles the plan to the shape the connector expects, then calls the one relevant method.

## Supported today

### PostgreSQL

- Driver: `pg`
- Credentials: `{ host, port, database, user, password, ssl }`
- Schema introspection: `information_schema.columns`
- Read-only: the sanitizer rejects anything that isn't a single `SELECT`.

### MySQL

- Driver: `mysql2`
- Credentials: `{ host, port, database, user, password, ssl }`
- Schema introspection: `information_schema.columns`
- Same SELECT-only policy.

### MongoDB

- Driver: `mongoose`
- Credentials: `{ uri, database }`
- Schema introspection: samples a few docs per collection to infer field types.
- The LLM plan is compiled to an aggregation pipeline; [lib/db/sanitize-pipeline.ts](../lib/db/sanitize-pipeline.ts) strips any write stage (`$out`, `$merge`).

### CSV

- Parser: `papaparse`
- Upload path: `users/{uid}/uploads/{timestamp}-{filename}` in Firebase Storage.
- On query: downloaded, parsed, materialized into a fresh in-memory DuckDB table, queried, discarded.

### Excel (`.xlsx`)

- Parser: `xlsx`
- Only the first sheet is imported by default.
- Same ephemeral-DuckDB flow as CSV.

## Roadmap

These are planned but not yet implemented. Each one plugs into the `getConnector()` union — the rest of the pipeline is already source-agnostic.

- **Google Sheets** — auth via Google OAuth (already present for sign-in), read via the Sheets API, treat each sheet as a "file" connection whose rows are re-fetched on query. Natural fit for the ephemeral-DuckDB pattern because the source is inherently mutable.
- **Microsoft SharePoint / Excel Online** — auth via Microsoft identity platform, read via Microsoft Graph (`/drives/.../workbook`). Same "re-fetch on query" model as Sheets.
- **BigQuery / Snowflake / Redshift** — additional `kind: 'relational'` drivers. The plan compiler already emits portable SQL; mostly a matter of adding a driver wrapper and credential form.
- **REST / GraphQL endpoints** — `kind: 'rest'` with a declarative response-to-table mapping. Longer-horizon.

## Adding a new source (contributor notes)

1. Add the credentials shape to [types/connection.ts](../types/connection.ts).
2. Extend the connection form in [components/connections/ConnectionForm.tsx](../components/connections/ConnectionForm.tsx).
3. Add a driver module under `lib/db/connectors/`.
4. Register it in [lib/db/router.ts](../lib/db/router.ts) with the correct `kind`.
5. Teach [lib/db/schema-retrieval.ts](../lib/db/schema-retrieval.ts) how to introspect the schema.
6. If the source is streamed/mutable (Sheets, SharePoint), prefer re-fetching on each query over persisting.
