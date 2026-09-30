import { open, rename, unlink, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { DesignDocument } from '@crescreendo/design-core/document'
import { FILE_LIMIT, projectPath, readProjectFile, sha256, writeProjectFile } from './files.js'
import { DOCUMENT_CONTRACT, OPERATIONS_VERSION, PROJECT_FORMAT, PROJECT_LIMIT,
  projectManifestSchema, projectSpecSchema, assertManifestFiles,
  type ProjectManifest, type ProjectSpec } from './project-schema.js'
import { inspectProjectDocument, parseProjectDocument, type ProjectDiagnostic } from './project-document.js'

export class ProjectConflictError extends Error {
  constructor(readonly expectedRevision: string | null, readonly actualRevision: string | null) {
    super('project-revision-conflict')
    this.name = 'ProjectConflictError'
  }
}
export interface ProjectSnapshot {
  revision: string
  manifest: ProjectManifest
  document: DesignDocument
}

export async function readProject(directory: string): Promise<ProjectSnapshot> {
  const manifestBytes = await readProjectFile(directory, 'project.json')
  const manifest = projectManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')))
  assertManifestFiles(manifest)
  const documentBytes = await readProjectFile(directory, manifest.document.path, manifest.document.sha256)
  if (documentBytes.length !== manifest.document.bytes) throw new Error('document-size-mismatch')
  const document = parseProjectDocument(JSON.parse(documentBytes.toString('utf8')))
  return { manifest, document, revision: sha256(manifestBytes) }
}

async function inspectFiles(directory: string, manifest: ProjectManifest): Promise<ProjectDiagnostic[]> {
  const issues: ProjectDiagnostic[] = []
  let size = 0
  // Bounded, sequential reads avoid allocating the whole project's files together.
  for (const file of assertManifestFiles(manifest)) {
    try {
      const bytes = await readProjectFile(directory, file.path, file.sha256)
      if (bytes.length !== file.bytes) throw new Error('file-size-mismatch')
      size += bytes.length
      if (size > PROJECT_LIMIT) throw new Error('project-too-large')
    } catch (error) {
      issues.push({ code: 'invalid-project-file', path: file.path,
        message: error instanceof Error ? error.message : 'File cannot be read' })
    }
  }
  return issues
}

export async function checkProject(directory: string) {
  try {
    const snapshot = await readProject(directory)
    const issues = [...inspectProjectDocument(snapshot.document, snapshot.manifest),
      ...await inspectFiles(directory, snapshot.manifest)]
    return { ok: issues.length === 0, revision: snapshot.revision,
      frames: snapshot.document.frames.length, issues,
      checks: { schema: true, references: true, fileHashes: true,
        fontDeclarations: true, fontGlyphs: false, mediaDecoding: false, render: false, visualQuality: false } }
  } catch (error) {
    return { ok: false, issues: [{ code: 'project-unreadable', path: 'project.json',
      message: error instanceof Error ? error.message : 'Project cannot be read' }] }
  }
}

async function withWriteLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true })
  const path = await projectPath(directory, '.porting-write.lock', true)
  const lock = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new Error('project-write-locked: another writer or an interrupted save; do not remove while a writer is running')
      throw error
    })
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    return await operation()
  } finally { await lock.close(); await unlink(path) }
}

async function currentRevision(directory: string) {
  try { return sha256(await readProjectFile(directory, 'project.json')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}

async function commitManifest(directory: string, manifest: ProjectManifest, expectedRevision: string | null) {
  const bytes = JSON.stringify(manifest, null, 2) + '\n'
  if (Buffer.byteLength(bytes) > FILE_LIMIT) throw new Error('project-manifest-too-large')
  const temporary = await projectPath(directory, `.porting-${randomUUID()}.tmp`, true)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally { await handle.close() }
    const actual = await currentRevision(directory)
    if (actual !== expectedRevision) throw new ProjectConflictError(expectedRevision, actual)
    await rename(temporary, await projectPath(directory, 'project.json', true))
    await syncDirectory(directory)
  } finally { await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error }) }
  return sha256(bytes)
}

/** One atomic manifest swap commits a whole snapshot; source files stay immutable. */
export async function saveProject(input: {
  directory: string; expectedRevision: string | null; document: unknown; spec?: ProjectSpec
}): Promise<ProjectSnapshot> {
  const document = parseProjectDocument(input.document)
  let documentBytes = JSON.stringify(input.document, null, 2) + '\n'
  if (Buffer.byteLength(documentBytes) > FILE_LIMIT) throw new Error('document-too-large')
  return withWriteLock(input.directory, async () => {
    const actual = await currentRevision(input.directory)
    if (actual !== input.expectedRevision) throw new ProjectConflictError(input.expectedRevision, actual)
    const previous = actual === null ? null : await readProject(input.directory)
    if (!previous) {
      const authored = await readProjectFile(input.directory, 'document.json').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (authored) {
        if (!isDeepStrictEqual(JSON.parse(authored.toString('utf8')), input.document)) throw new Error('porting-existing-file-differs')
        documentBytes = authored.toString('utf8')
      }
    }
    const spec = projectSpecSchema.parse(input.spec ?? (previous && {
      title: previous.manifest.title, resources: previous.manifest.resources,
      screenshots: previous.manifest.screenshots, attachments: previous.manifest.attachments,
    }))
    const documentHash = sha256(documentBytes)
    const path = previous
      ? previous.manifest.document.sha256 === documentHash ? previous.manifest.document.path : `documents/${documentHash}.json`
      : 'document.json'
    const manifest = projectManifestSchema.parse({ ...spec, format: PROJECT_FORMAT, containerVersion: 1,
      document: { path, sha256: documentHash, bytes: Buffer.byteLength(documentBytes) },
      compatibility: { documentContract: DOCUMENT_CONTRACT, operations: OPERATIONS_VERSION } })
    assertManifestFiles(manifest)
    // Schema-valid drafts may still have missing resources; the check report stays
    // explicit. Never persist transport URLs as portable document asset sources.
    const nonportable = inspectProjectDocument(document, manifest).filter(issue => issue.code === 'nonportable-asset')
    if (nonportable.length) throw new Error(JSON.stringify(nonportable))
    await writeProjectFile(input.directory, path, documentBytes)
    // Flush the new document before committing a pointer to it.
    const documentPath = await projectPath(input.directory, path, false)
    const persisted = await open(documentPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try { await persisted.sync() } finally { await persisted.close() }
    await syncDirectory(dirname(documentPath))
    const revision = await commitManifest(input.directory, manifest, input.expectedRevision)
    return { revision, manifest, document }
  })
}
