import { createHash } from 'crypto'

export function hashPdfContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
