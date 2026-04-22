import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isAuthResponse } from '@/lib/firebase/api-auth'
import { createConnection } from '@/lib/data/repos'
import {
  buildFileSchema,
  parseFile,
} from '@/lib/db/connectors/file-tabular'
import {
  maxFileBytes,
  uploadBuffer,
  validateFileType,
} from '@/lib/files/storage'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthResponse(auth)) return auth

  const form = await req.formData()
  const file = form.get('file') as File | null
  const name = (form.get('name') as string | null) ?? null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const typeCheck = validateFileType(file.name)
  if (!typeCheck.valid || !typeCheck.type) {
    return NextResponse.json({ error: 'Only CSV or Excel files are supported.' }, { status: 400 })
  }

  if (file.size > maxFileBytes()) {
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(maxFileBytes() / 1024 / 1024)}MB limit.` },
      { status: 400 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const uploadType = typeCheck.type === 'csv' ? 'CSV' : 'EXCEL'
  const parsed = parseFile(buffer, uploadType)

  const connectionName = name ?? file.name.replace(/\.[^/.]+$/, '')
  const tableName =
    connectionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50) || 'dataset'

  const { objectKey } = await uploadBuffer(
    auth.uid,
    file.name,
    buffer,
    uploadType === 'CSV'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )

  const schema = buildFileSchema(tableName, parsed.columns, parsed.rows)

  const connection = await createConnection(auth.uid, {
    name: connectionName,
    type: uploadType,
    credentials: {
      fileName: file.name,
      tableName,
      rowCount: parsed.rows.length,
      columnCount: parsed.columns.length,
    },
    schema,
    fileObjectKey: objectKey,
    fileSizeBytes: file.size,
  })

  return NextResponse.json(
    {
      connection,
      meta: {
        rowCount: parsed.rows.length,
        columnCount: parsed.columns.length,
        columns: parsed.columns,
      },
    },
    { status: 201 },
  )
}
