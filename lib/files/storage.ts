import 'server-only'
import { adminStorage } from '@/lib/firebase/admin'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

export function validateFileType(fileName: string): { valid: boolean; type?: 'csv' | 'excel' } {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return { valid: true, type: 'csv' }
  if (ext === 'xlsx' || ext === 'xls') return { valid: true, type: 'excel' }
  return { valid: false }
}

export function maxFileBytes(): number {
  return MAX_FILE_BYTES
}

export async function uploadBuffer(
  uid: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ objectKey: string }> {
  const objectKey = `users/${uid}/uploads/${Date.now()}-${fileName}`
  const bucket = adminStorage.bucket()
  await bucket.file(objectKey).save(buffer, { contentType, resumable: false })
  return { objectKey }
}

export async function downloadBuffer(objectKey: string): Promise<Buffer> {
  const [contents] = await adminStorage.bucket().file(objectKey).download()
  return contents
}

export async function deleteObject(objectKey: string): Promise<void> {
  await adminStorage
    .bucket()
    .file(objectKey)
    .delete({ ignoreNotFound: true })
}
