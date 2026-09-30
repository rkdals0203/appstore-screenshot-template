import { Unzip, UnzipInflate } from 'fflate'
import { assertProjectPath, FILE_LIMIT } from './project-path.js'
import { PROJECT_FILE_LIMIT, PROJECT_LIMIT } from './project-schema.js'

const ARCHIVE_LIMIT = PROJECT_LIMIT
const u16 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(at, true)
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true)

/** Inspect central-directory sizes and Unix file types before inflating anything. */
function inspectArchive(bytes: Uint8Array) {
  if (bytes.length > ARCHIVE_LIMIT) throw new Error('archive-too-large')
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (u32(bytes, at) === 0x06054b50 && at + 22 + u16(bytes, at + 20) === bytes.length) { end = at; break }
  }
  if (end < 0) throw new Error('archive-invalid-directory')
  const count = u16(bytes, end + 10), size = u32(bytes, end + 12), start = u32(bytes, end + 16)
  if (u16(bytes, end + 4) || u16(bytes, end + 6) || u16(bytes, end + 8) !== count
    || count > PROJECT_FILE_LIMIT || start + size !== end) throw new Error('archive-unsupported-directory')
  const entries = new Map<string, { size: number; compressed: number; crc: number; directory: boolean }>()
  const names = new Set<string>()
  let at = start, total = 0
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || u32(bytes, at) !== 0x02014b50) throw new Error('archive-invalid-entry')
    const flags = u16(bytes, at + 8), compression = u16(bytes, at + 10)
    const nameLength = u16(bytes, at + 28), extraLength = u16(bytes, at + 30), commentLength = u16(bytes, at + 32)
    const next = at + 46 + nameLength + extraLength + commentLength
    if (next > end || flags & 1 || ![0, 8].includes(compression)) throw new Error('archive-unsupported-entry')
    const rawName = bytes.subarray(at + 46, at + 46 + nameLength)
    const name = new TextDecoder('utf-8', { fatal: true }).decode(rawName)
    const directory = name.endsWith('/')
    assertProjectPath(directory ? name.slice(0, -1) : name)
    const key = name.replace(/\/$/, '').normalize('NFC').toLowerCase()
    if (names.has(key)) throw new Error('archive-duplicate-path')
    names.add(key)
    const unixType = (u32(bytes, at + 38) >>> 16) & 0xf000
    if (unixType && unixType !== (directory ? 0x4000 : 0x8000)) throw new Error('archive-symlink-or-special-file')
    const uncompressed = u32(bytes, at + 24), compressed = u32(bytes, at + 20)
    total += uncompressed
    if (uncompressed > FILE_LIMIT || total > PROJECT_LIMIT || (directory && uncompressed)) throw new Error('archive-expansion-too-large')
    const offset = u32(bytes, at + 42)
    if (offset + 30 > start || u32(bytes, offset) !== 0x04034b50) throw new Error('archive-invalid-local-header')
    const localNameLength = u16(bytes, offset + 26), localExtraLength = u16(bytes, offset + 28)
    const body = offset + 30 + localNameLength + localExtraLength
    if (body + compressed > start || (localNameLength !== rawName.length || !bytes.subarray(offset + 30, offset + 30 + localNameLength).every((byte, index) => byte === rawName[index]))
      || u16(bytes, offset + 6) !== flags || u16(bytes, offset + 8) !== compression) throw new Error('archive-header-mismatch')
    entries.set(name, { size: uncompressed, compressed, crc: u32(bytes, at + 16), directory })
    at = next
  }
  if (at !== end) throw new Error('archive-directory-size-mismatch')
  return entries
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function decodeProjectArchive(bytes: Uint8Array) {
  const entries = inspectArchive(bytes)
  const files = new Map<string, Uint8Array>()
  const seen = new Set<string>()
  let total = 0
  const unzip = new Unzip(file => {
    const expected = entries.get(file.name)
    if (!expected || seen.has(file.name) || file.size !== expected.compressed
      || file.originalSize !== expected.size) throw new Error('archive-entry-mismatch')
    seen.add(file.name)
    let size = 0
    const chunks: Uint8Array[] = []
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      size += chunk.length
      total += chunk.length
      if (size > expected.size || total > PROJECT_LIMIT) { file.terminate(); throw new Error('archive-expansion-too-large') }
      chunks.push(chunk)
      if (final) {
        const content = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length }
        if (content.length !== expected.size || crc32(content) !== expected.crc) throw new Error('archive-integrity-failed')
        if (!expected.directory) files.set(file.name, content)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  // Bound the decompressor's output allocation even if declared sizes are false.
  for (let at = 0; at < bytes.length; at += 8192) unzip.push(bytes.subarray(at, at + 8192), at + 8192 >= bytes.length)
  if (seen.size !== entries.size || files.size !== [...entries.values()].filter(entry => !entry.directory).length) throw new Error('archive-incomplete')
  return files
}
