import { createHash } from 'node:crypto'
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
export { assertProjectPath, FILE_LIMIT } from './project-path.js'
import { assertProjectPath, FILE_LIMIT } from './project-path.js'

/** Project references are portable POSIX paths, never URLs or machine-specific paths. */
export async function projectPath(root: string, path: string, create: boolean) {
  assertProjectPath(path)
  const parts = path.split('/')
  if (create) await mkdir(root, { recursive: true })
  let current = await realpath(root)
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    if (create && index < parts.length - 1) {
      await mkdir(current).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e })
    }
    const stat = await lstat(current).catch((e: NodeJS.ErrnoException) => {
      if (create && index === parts.length - 1 && e.code === 'ENOENT') return null
      throw e
    })
    if (stat?.isSymbolicLink()) throw new Error('porting-symlink-disallowed')
    if (stat && !(index === parts.length - 1 ? stat.isFile() : stat.isDirectory())) throw new Error('porting-path-invalid')
  }
  return current
}

export async function readProjectFile(root: string, path: string, expectedHash?: string, maxBytes = FILE_LIMIT) {
  const file = await open(await projectPath(root, path, false), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('porting-file-too-large-or-invalid')
    const bytes = await file.readFile()
    if (bytes.length > maxBytes) throw new Error('porting-file-too-large-or-invalid')
    if (expectedHash && sha256(bytes) !== expectedHash) throw new Error('porting-file-hash-mismatch')
    return bytes
  } finally { await file.close() }
}

export async function writeProjectFile(root: string, path: string, bytes: Uint8Array | string, maxBytes = FILE_LIMIT) {
  if ((typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length) > maxBytes) throw new Error('porting-file-too-large-or-invalid')
  const destination = await projectPath(root, path, true)
  const temporary = join(dirname(destination), `.porting-${randomUUID()}.tmp`)
  const file = await open(temporary, 'wx', 0o600)
  try {
    try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
    // link atomically publishes a complete immutable file and refuses overwrite.
    try { await link(temporary, destination) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (sha256(await readProjectFile(root, path, undefined, maxBytes)) !== sha256(bytes)) throw new Error('porting-existing-file-differs')
    }
  } finally { await unlink(temporary) }
}

export async function writeRecord(root: string, prefix: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + '\n'
  const path = `${prefix}-${sha256(bytes)}.json`
  await writeProjectFile(root, path, bytes)
  return path
}
