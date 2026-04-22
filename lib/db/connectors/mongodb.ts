import mongoose from 'mongoose'
import type { MongoCredentials, SchemaInfo } from '@/types/connection'

const ObjectId = mongoose.Types.ObjectId

const SAMPLE_SIZE = 100
const MAX_DOCS = 10000

interface PipelineResult {
  docs: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

async function createConnection(creds: MongoCredentials): Promise<mongoose.Connection> {
  const connection = mongoose.createConnection(creds.uri, {
    dbName: creds.database,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 15000,
    maxPoolSize: 5,
  })
  await connection.asPromise()
  return connection
}

export async function testConnection(
  creds: MongoCredentials
): Promise<{ success: boolean; message: string }> {
  let connection: mongoose.Connection | null = null
  try {
    connection = await createConnection(creds)
    if (!connection.db) {
      throw new Error('Database connection not established')
    }
    const adminDb = connection.db.admin()
    await adminDb.ping()
    return { success: true, message: 'Connection successful' }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown connection error'
    return { success: false, message: `Connection failed: ${message}` }
  } finally {
    if (connection) await connection.close()
  }
}

export async function executePipeline(
  creds: MongoCredentials,
  collectionName: string,
  pipeline: Record<string, unknown>[]
): Promise<PipelineResult> {
  let connection: mongoose.Connection | null = null
  try {
    connection = await createConnection(creds)
    if (!connection.db) {
      throw new Error('Database connection not established')
    }
    const db = connection.db
    const collection = db.collection(collectionName)

    const start = performance.now()
    const docs = await collection
      .aggregate(pipeline as Record<string, unknown>[])
      .limit(MAX_DOCS)
      .toArray()
    const durationMs = Math.round(performance.now() - start)

    return {
      docs: docs as Record<string, unknown>[],
      rowCount: docs.length,
      durationMs,
    }
  } catch (error) {
    throw new Error(
      `MongoDB pipeline execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    if (connection) await connection.close()
  }
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  if (value instanceof ObjectId) return 'objectId'
  return typeof value
}

function flattenDocument(
  doc: Record<string, unknown>,
  prefix = ''
): Record<string, { type: string; occurrences: number }> {
  const result: Record<string, { type: string; occurrences: number }> = {}

  for (const [key, value] of Object.entries(doc)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof ObjectId)) {
      const nested = flattenDocument(value as Record<string, unknown>, path)
      for (const [nestedPath, info] of Object.entries(nested)) {
        if (result[nestedPath]) {
          result[nestedPath].occurrences += info.occurrences
        } else {
          result[nestedPath] = { ...info }
        }
      }
    } else {
      const detectedType = inferType(value)
      if (result[path]) {
        result[path].occurrences += 1
      } else {
        result[path] = { type: detectedType, occurrences: 1 }
      }
    }
  }

  return result
}

export async function introspectSchema(
  creds: MongoCredentials
): Promise<SchemaInfo> {
  let connection: mongoose.Connection | null = null
  try {
    connection = await createConnection(creds)
    if (!connection.db) {
      throw new Error('Database connection not established')
    }
    const db = connection.db

    const collections = await db.listCollections().toArray()

    const tables: SchemaInfo['tables'] = []

    for (const collInfo of collections) {
      if (collInfo.type !== 'collection') continue

      const collection = db.collection(collInfo.name)
      const totalCount = await collection.estimatedDocumentCount()

      const sampleDocs = await collection
        .find({})
        .limit(SAMPLE_SIZE)
        .toArray()

      const fieldStats: Record<
        string,
        { types: Set<string>; nullable: number; total: number }
      > = {}

      for (const doc of sampleDocs) {
        const flatDoc = doc as Record<string, unknown>
        const flattened = flattenDocument(flatDoc)

        for (const [fieldPath, info] of Object.entries(flattened)) {
          if (!fieldStats[fieldPath]) {
            fieldStats[fieldPath] = { types: new Set(), nullable: 0, total: 0 }
          }
          fieldStats[fieldPath].types.add(info.type)
          fieldStats[fieldPath].total += 1
          if (info.type === 'null') {
            fieldStats[fieldPath].nullable += 1
          }
        }
      }

      const columns: SchemaInfo['tables'][0]['columns'] = Object.entries(
        fieldStats
      ).map(([name, stats]) => ({
        name,
        type: Array.from(stats.types).filter((t) => t !== 'null').join(' | ') || 'unknown',
        nullable: stats.nullable > 0,
      }))

      tables.push({
        name: collInfo.name,
        columns,
        rowCount: totalCount,
      })
    }

    return { tables }
  } catch (error) {
    throw new Error(
      `MongoDB schema introspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    if (connection) await connection.close()
  }
}
