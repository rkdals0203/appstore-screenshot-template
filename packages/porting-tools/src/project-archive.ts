import { mkdtemp, rename, rm, lstat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { zipSync } from 'fflate'
import { readProjectFile, sha256, writeProjectFile } from './files.js'
import { assertManifestFiles, PROJECT_LIMIT } from './project-schema.js'
import { checkProject, readProject } from './project.js'
import { inspectProjectDocument } from './project-document.js'

const ARCHIVE_LIMIT = PROJECT_LIMIT
export { decodeProjectArchive } from './archive-codec.js'
import { decodeProjectArchive } from './archive-codec.js'

export async function packProject(directory: string, destination: string) {
  const snapshot = await readProject(directory)
  const files: Record<string, Uint8Array> = Object.create(null)
  files['project.json'] = await readProjectFile(directory, 'project.json', snapshot.revision)
  for (const file of assertManifestFiles(snapshot.manifest)) {
    const bytes = await readProjectFile(directory, file.path, file.sha256)
    if (bytes.length !== file.bytes) throw new Error(`file-size-mismatch:${file.path}`)
    files[file.path] = bytes
  }
  const archive = zipSync(files, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') })
  if (archive.length > ARCHIVE_LIMIT) throw new Error('archive-too-large')
  await writeProjectFile(dirname(resolve(destination)), basename(destination), archive, ARCHIVE_LIMIT)
  const issues = inspectProjectDocument(snapshot.document, snapshot.manifest)
  return { archive: resolve(destination), sha256: sha256(archive), bytes: archive.length,
    revision: snapshot.revision, check: { ok: issues.length === 0, issues, render: false } }
}

export async function unpackProject(archive: string, destination: string) {
  const target = resolve(destination)
  if (await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return null })) {
    throw new Error('project-destination-exists')
  }
  const files = decodeProjectArchive(await readProjectFile(dirname(resolve(archive)), basename(archive), undefined, ARCHIVE_LIMIT))
  const staging = await mkdtemp(join(dirname(target), '.porting-unpack-'))
  try {
    for (const [path, bytes] of files) await writeProjectFile(staging, path, bytes)
    const snapshot = await readProject(staging)
    const allowed = new Set(['project.json', ...assertManifestFiles(snapshot.manifest).map(file => file.path)])
    for (const path of files.keys()) if (!allowed.has(path)) throw new Error(`archive-unregistered-file:${path}`)
    for (const file of assertManifestFiles(snapshot.manifest)) {
      const bytes = await readProjectFile(staging, file.path, file.sha256)
      if (bytes.length !== file.bytes) throw new Error(`file-size-mismatch:${file.path}`)
    }
    // Never replace an existing project, including an empty directory.
    if (await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return null })) throw new Error('project-destination-exists')
    await rename(staging, target)
    return { directory: target, revision: snapshot.revision, check: await checkProject(target) }
  } finally { await rm(staging, { recursive: true, force: true }) }
}
