import 'server-only'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { SchemaInfo } from '@/types/connection'

const MAX_ROWS = 200_000
const SAMPLE_ROWS_FOR_SCHEMA = 50

interface DuckConnection {
  run(sql: string, ...args: unknown[]): void
  all(sql: string, cb: (err: Error | null, rows: Record<string, unknown>[]) => void): void
  close(): void
}

interface DuckDatabase {
  connect(): DuckConnection
  close(): void
}

function loadDuckDB(): { Database: new (path: string) => DuckDatabase } {
  try {
    // Lazy runtime require avoids loading native duckdb during platform build-time analysis.
    return require('duckdb') as { Database: new (path: string) => DuckDatabase }
  } catch {
    throw new Error('File querying engine is unavailable in this runtime environment.')
  }
}

export interface ParsedFile {
  columns: string[]
  rows: Record<string, unknown>[]
}

export function parseCsv(buffer: Buffer): ParsedFile {
  const text = buffer.toString('utf-8')
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  })
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
  }
  const rows = parsed.data.slice(0, MAX_ROWS)
  const columns = parsed.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : [])
  return { columns, rows }
}

export function parseExcel(buffer: Buffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Workbook has no sheets')
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  })
  const trimmed = rows.slice(0, MAX_ROWS)
  const columns = trimmed[0] ? Object.keys(trimmed[0]) : []
  return { columns, rows: trimmed }
}

export function parseFile(buffer: Buffer, type: 'CSV' | 'EXCEL'): ParsedFile {
  return type === 'CSV' ? parseCsv(buffer) : parseExcel(buffer)
}

function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_')
  return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `t_${cleaned}`
}

function inferType(value: unknown): 'DOUBLE' | 'BIGINT' | 'BOOLEAN' | 'VARCHAR' {
  if (typeof value === 'number') return Number.isInteger(value) ? 'BIGINT' : 'DOUBLE'
  if (typeof value === 'boolean') return 'BOOLEAN'
  return 'VARCHAR'
}

function columnTypes(rows: Record<string, unknown>[], columns: string[]) {
  const sample = rows.slice(0, SAMPLE_ROWS_FOR_SCHEMA)
  return Object.fromEntries(
    columns.map((c) => {
      const firstDefined = sample.find((r) => r[c] != null)?.[c]
      return [c, firstDefined === undefined ? 'VARCHAR' : inferType(firstDefined)]
    }),
  )
}

export async function queryTabular(
  tableName: string,
  file: ParsedFile,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number; durationMs: number }> {
  const { Database } = loadDuckDB()
  const safeTable = sanitizeIdentifier(tableName)
  const colMap = Object.fromEntries(file.columns.map((c) => [c, sanitizeIdentifier(c)]))
  const types = columnTypes(file.rows, file.columns)

  const db = new Database(':memory:')
  const conn = db.connect()
  const started = Date.now()

  try {
    const colDefs = file.columns.map((c) => `"${colMap[c]}" ${types[c]}`).join(', ')
    await runAsync(conn, `DROP TABLE IF EXISTS "${safeTable}"`)
    await runAsync(conn, `CREATE TABLE "${safeTable}" (${colDefs})`)

    const batchSize = 500
    for (let i = 0; i < file.rows.length; i += batchSize) {
      const batch = file.rows.slice(i, i + batchSize)
      const placeholders = batch
        .map(() => `(${file.columns.map(() => '?').join(', ')})`)
        .join(', ')
      const values = batch.flatMap((r) => file.columns.map((c) => coerceValue(r[c])))
      await runAsync(conn, `INSERT INTO "${safeTable}" VALUES ${placeholders}`, values)
    }

    const rewritten = sql.replace(
      new RegExp(`"?${escapeRegex(tableName)}"?`, 'gi'),
      `"${safeTable}"`,
    )

    const rows = await allAsync(conn, rewritten)
    return { rows, rowCount: rows.length, durationMs: Date.now() - started }
  } finally {
    conn.close()
    db.close()
  }
}

export function buildFileSchema(
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): SchemaInfo {
  const types = columnTypes(rows, columns)
  return {
    tables: [
      {
        name: tableName,
        columns: columns.map((c) => ({
          name: c,
          type: types[c],
          nullable: rows.some((r) => r[c] == null),
        })),
        rowCount: rows.length,
      },
    ],
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function coerceValue(v: unknown): unknown {
  if (v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  return v
}

function runAsync(conn: DuckConnection, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.run(sql, ...params, (err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function allAsync(conn: DuckConnection, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}
