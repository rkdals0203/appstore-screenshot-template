import { open } from 'node:fs/promises'
import sharp from 'sharp'

export async function readRaster(path: string) {
  const handle = await open(path, 'r')
  let bytes: Buffer
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw new Error('source-too-large-or-invalid')
    bytes = await handle.readFile()
  } finally { await handle.close() }
  if (bytes.length > 25 * 1024 * 1024) throw new Error('source-too-large')
  const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata()
  if (!meta.width || !meta.height || !['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) !== 1) {
    throw new Error('source-format-unsupported')
  }
  await sharp(bytes, { limitInputPixels: 40_000_000 }).stats()
  return { bytes, width: meta.width, height: meta.height, format: meta.format! }
}
