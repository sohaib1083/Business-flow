import type {
  ConnectionType,
  SchemaInfo,
  PostgresCredentials,
  MySQLCredentials,
  MongoCredentials,
} from '@/types/connection'
import * as postgres from './connectors/postgres'
import * as mysql from './connectors/mysql'
import * as mongo from './connectors/mongodb'
import * as file from './connectors/file-tabular'

/**
 * Kind-tagged connectors so call sites don't need to branch on the enum
 * string in every file.
 */

export type RelationalCreds = PostgresCredentials | MySQLCredentials

export interface RelationalConnector {
  kind: 'relational'
  test(creds: RelationalCreds): Promise<{ success: boolean; message: string }>
  execute(creds: RelationalCreds, sql: string): Promise<{
    rows: Record<string, unknown>[]
    rowCount: number
    durationMs: number
  }>
  introspect(creds: RelationalCreds): Promise<SchemaInfo>
}

export interface MongoConnector {
  kind: 'mongo'
  test(creds: MongoCredentials): Promise<{ success: boolean; message: string }>
  executePipeline(
    creds: MongoCredentials,
    collection: string,
    pipeline: Record<string, unknown>[],
  ): Promise<{ docs: Record<string, unknown>[]; rowCount: number; durationMs: number }>
  introspect(creds: MongoCredentials): Promise<SchemaInfo>
}

export interface FileConnector {
  kind: 'file'
  parseCsv: typeof file.parseCsv
  parseExcel: typeof file.parseExcel
  parseFile: typeof file.parseFile
  queryTabular: typeof file.queryTabular
  buildFileSchema: typeof file.buildFileSchema
}

export type Connector = RelationalConnector | MongoConnector | FileConnector

export function getConnector(type: ConnectionType): Connector {
  switch (type) {
    case 'POSTGRES':
      return {
        kind: 'relational',
        test: (c) => postgres.testConnection(c as PostgresCredentials),
        execute: (c, sql) => postgres.executeQuery(c as PostgresCredentials, sql),
        introspect: (c) => postgres.introspectSchema(c as PostgresCredentials),
      }
    case 'MYSQL':
      return {
        kind: 'relational',
        test: (c) => mysql.testConnection(c as MySQLCredentials),
        execute: (c, sql) => mysql.executeQuery(c as MySQLCredentials, sql),
        introspect: (c) => mysql.introspectSchema(c as MySQLCredentials),
      }
    case 'MONGODB':
      return {
        kind: 'mongo',
        test: (c) => mongo.testConnection(c),
        executePipeline: (c, col, pipe) => mongo.executePipeline(c, col, pipe),
        introspect: (c) => mongo.introspectSchema(c),
      }
    case 'CSV':
    case 'EXCEL':
      return {
        kind: 'file',
        parseCsv: file.parseCsv,
        parseExcel: file.parseExcel,
        parseFile: file.parseFile,
        queryTabular: file.queryTabular,
        buildFileSchema: file.buildFileSchema,
      }
    default:
      throw new Error(`Unsupported connection type: ${type as string}`)
  }
}
