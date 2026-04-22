import pg from 'pg'
import type { PostgresCredentials, SchemaInfo } from '@/types/connection'

// Postgres returns NUMERIC/DECIMAL and BIGINT as strings by default because
// JS numbers lose precision above 2^53. For an analytics product that is fine:
// we parse them to numbers so charts, summaries, and JSON all treat them
// consistently. If a client needs exact precision for invoices they can opt
// out by setting BF_EXACT_NUMERIC=1.
if (!process.env.BF_EXACT_NUMERIC) {
  // 1700 = NUMERIC, 20 = INT8/BIGINT, 701 = FLOAT8, 700 = FLOAT4
  pg.types.setTypeParser(1700, (v: string) => Number(v))
  pg.types.setTypeParser(20, (v: string) => Number(v))
  pg.types.setTypeParser(701, (v: string) => Number(v))
  pg.types.setTypeParser(700, (v: string) => Number(v))
}

const DEFAULT_STATEMENT_TIMEOUT = 10000
const MAX_ROWS = 10000

interface QueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

function buildConnectionString(creds: PostgresCredentials): string {
  const sslParam = creds.ssl ? '?sslmode=require' : ''
  return `postgresql://${creds.user}:${encodeURIComponent(creds.password)}@${creds.host}:${creds.port}/${creds.database}${sslParam}`
}

function createPool(creds: PostgresCredentials): pg.Pool {
  return new pg.Pool({
    connectionString: buildConnectionString(creds),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: DEFAULT_STATEMENT_TIMEOUT,
  })
}

export async function testConnection(
  creds: PostgresCredentials
): Promise<{ success: boolean; message: string }> {
  let pool: pg.Pool | null = null
  try {
    pool = createPool(creds)
    const client = await pool.connect()
    try {
      await client.query('SELECT 1 AS health_check')
      return { success: true, message: 'Connection successful' }
    } finally {
      client.release()
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown connection error'
    return { success: false, message: `Connection failed: ${message}` }
  } finally {
    if (pool) await pool.end()
  }
}

export async function executeQuery(
  creds: PostgresCredentials,
  sql: string
): Promise<QueryResult> {
  let pool: pg.Pool | null = null
  try {
    pool = createPool(creds)
    const enforcedSql = sql.replace(/;?\s*$/, '')
    const limitedSql = /LIMIT\s+\d+/i.test(enforcedSql)
      ? enforcedSql
      : `${enforcedSql} LIMIT ${MAX_ROWS}`

    const start = performance.now()
    const result = await pool.query(limitedSql)
    const durationMs = Math.round(performance.now() - start)

    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
      durationMs,
    }
  } catch (error) {
    throw new Error(
      `PostgreSQL query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    if (pool) await pool.end()
  }
}

export async function introspectSchema(
  creds: PostgresCredentials
): Promise<SchemaInfo> {
  let pool: pg.Pool | null = null
  try {
    pool = createPool(creds)

    const tablesResult = await pool.query(`
      SELECT
        t.table_schema,
        t.table_name,
        (SELECT count_estimate)
        FROM information_schema.tables t
        LEFT JOIN LATERAL (
          SELECT reltuples::bigint AS count_estimate
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = t.table_schema AND c.relname = t.table_name
        ) est ON true
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name
    `)

    const columnsResult = await pool.query(`
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable = 'YES' AS nullable,
        col_description(
          (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
          c.ordinal_position
        ) AS column_comment
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
    `)

    const fkResult = await pool.query(`
      SELECT
        tc.table_schema AS from_schema,
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_schema AS to_schema,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
    `)

    const tableMap = new Map<string, { schema: string; name: string; rowCount?: number }>()
    for (const row of tablesResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      tableMap.set(key, {
        schema: row.table_schema as string,
        name: row.table_name as string,
        rowCount: (row.count_estimate as number) ?? undefined,
      })
    }

    const columnsByTable = new Map<string, SchemaInfo['tables'][0]['columns']>()
    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      if (!columnsByTable.has(key)) {
        columnsByTable.set(key, [])
      }
      columnsByTable.get(key)!.push({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.nullable as boolean,
        description: (row.column_comment as string) || undefined,
      })
    }

    const tables: SchemaInfo['tables'] = []
    for (const [key, meta] of Array.from(tableMap.entries())) {
      tables.push({
        name: meta.name,
        schema: meta.schema,
        columns: columnsByTable.get(key) ?? [],
        rowCount: meta.rowCount,
      })
    }

    const relationships: SchemaInfo['relationships'] = fkResult.rows.map((row) => ({
      from: {
        table: `${row.from_schema}.${row.from_table}`,
        column: row.from_column as string,
      },
      to: {
        table: `${row.to_schema}.${row.to_table}`,
        column: row.to_column as string,
      },
      type: 'one-to-many' as const,
    }))

    return { tables, relationships }
  } catch (error) {
    throw new Error(
      `PostgreSQL schema introspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    if (pool) await pool.end()
  }
}
