export type ConnectionType = 'POSTGRES' | 'MYSQL' | 'CSV' | 'EXCEL' | 'MONGODB'

export type ConnectionStatus = 'ACTIVE' | 'ERROR' | 'DISABLED'

export interface PostgresCredentials {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
}

export type MySQLCredentials = PostgresCredentials

export interface MongoCredentials {
  uri: string
  database: string
}

export interface FileConnectionMeta {
  fileName: string
  tableName: string
  rowCount: number
  columnCount: number
}

export interface SchemaInfo {
  tables: Array<{
    name: string
    schema?: string
    columns: Array<{
      name: string
      type: string
      nullable: boolean
      description?: string
    }>
    rowCount?: number
  }>
  relationships?: Array<{
    from: { table: string; column: string }
    to: { table: string; column: string }
    type: 'one-to-many' | 'many-to-many'
  }>
}
