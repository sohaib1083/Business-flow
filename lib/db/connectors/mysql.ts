import mysql from 'mysql2/promise'
import type { MySQLCredentials, SchemaInfo } from '@/types/connection'

const DEFAULT_STATEMENT_TIMEOUT = 10000
const MAX_ROWS = 10000

interface QueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

function buildConnectionConfig(creds: MySQLCredentials): mysql.ConnectionOptions {
  return {
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.user,
    password: creds.password,
    ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 5,
    connectTimeout: 10000,
  }
}

function formatConnectionError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('timed out') || lower.includes('etimedout')) {
    return 'Connection timed out. The database host may be private/inaccessible from Vercel. Use a publicly reachable host or allowlist Vercel egress IPs.'
  }
  if (lower.includes('access denied')) {
    return 'Authentication failed. Check username/password and grants for this host.'
  }
  if (lower.includes('ssl') || lower.includes('certificate')) {
    return 'SSL/TLS handshake failed. Try enabling SSL in the connection form or adjust server SSL settings.'
  }
  return `Connection failed: ${message}`
}

export async function testConnection(
  creds: MySQLCredentials
): Promise<{ success: boolean; message: string }> {
  let connection: mysql.Connection | null = null
  try {
    connection = await mysql.createConnection(buildConnectionConfig(creds))
    await connection.execute('SELECT 1 AS health_check')
    return { success: true, message: 'Connection successful' }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown connection error'
    return { success: false, message: formatConnectionError(message) }
  } finally {
    if (connection) await connection.end()
  }
}

export async function executeQuery(
  creds: MySQLCredentials,
  sql: string
): Promise<QueryResult> {
  let connection: mysql.Connection | null = null
  try {
    connection = await mysql.createConnection(buildConnectionConfig(creds))
    await connection.execute(`SET SESSION max_execution_time = ${DEFAULT_STATEMENT_TIMEOUT}`)

    const enforcedSql = sql.replace(/;?\s*$/, '')
    const limitedSql = /LIMIT\s+\d+/i.test(enforcedSql)
      ? enforcedSql
      : `${enforcedSql} LIMIT ${MAX_ROWS}`

    const start = performance.now()
    const [result] = await connection.execute(limitedSql)
    const durationMs = Math.round(performance.now() - start)

    const rows = Array.isArray(result)
      ? (result as Record<string, unknown>[])
      : []

    return {
      rows,
      rowCount: rows.length,
      durationMs,
    }
  } catch (error) {
    throw new Error(
      `MySQL query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    if (connection) await connection.end()
  }
}

export async function introspectSchema(
  creds: MySQLCredentials
): Promise<SchemaInfo> {
  let connection: mysql.Connection | null = null
  try {
    connection = await mysql.createConnection(buildConnectionConfig(creds))

    const [tablesResult] = await connection.execute<mysql.RowDataPacket[]>(`
      SELECT
        t.TABLE_SCHEMA,
        t.TABLE_NAME,
        t.TABLE_ROWS
      FROM information_schema.TABLES t
      WHERE t.TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
        AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
    `)

    const [columnsResult] = await connection.execute<mysql.RowDataPacket[]>(`
      SELECT
        c.TABLE_SCHEMA,
        c.TABLE_NAME,
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.IS_NULLABLE = 'YES' AS nullable,
        c.COLUMN_COMMENT
      FROM information_schema.COLUMNS c
      WHERE c.TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
    `)

    const [fkResult] = await connection.execute<mysql.RowDataPacket[]>(`
      SELECT
        kcu.TABLE_SCHEMA AS from_schema,
        kcu.TABLE_NAME AS from_table,
        kcu.COLUMN_NAME AS from_column,
        kcu.REFERENCED_TABLE_SCHEMA AS to_schema,
        kcu.REFERENCED_TABLE_NAME AS to_table,
        kcu.REFERENCED_COLUMN_NAME AS to_column
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.REFERENCED_TABLE_NAME IS NOT NULL
        AND kcu.TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
    `)

    const tableMap = new Map<string, { schema: string; name: string; rowCount?: number }>()
    for (const row of tablesResult) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`
      tableMap.set(key, {
        schema: row.TABLE_SCHEMA as string,
        name: row.TABLE_NAME as string,
        rowCount: (row.TABLE_ROWS as number) ?? undefined,
      })
    }

    const columnsByTable = new Map<string, SchemaInfo['tables'][0]['columns']>()
    for (const row of columnsResult) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`
      if (!columnsByTable.has(key)) {
        columnsByTable.set(key, [])
      }
      columnsByTable.get(key)!.push({
        name: row.COLUMN_NAME as string,
        type: row.DATA_TYPE as string,
        nullable: Boolean(row.nullable),
        description: (row.COLUMN_COMMENT as string) || undefined,
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

    const relationships: SchemaInfo['relationships'] = fkResult.map((row) => ({
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
      `MySQL schema introspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    if (connection) await connection.end()
  }
}
