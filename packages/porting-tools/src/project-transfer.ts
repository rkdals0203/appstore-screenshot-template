import { zipSync } from 'fflate'
import { decodeProjectArchive } from './archive-codec.js'
import { assertManifestFiles, projectManifestSchema, type ProjectManifest } from './project-schema.js'
import { inspectProjectDocument, parseProjectDocument } from './project-document.js'

export const hashBytes = async (bytes: Uint8Array): Promise<string> => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
  byte => byte.toString(16).padStart(2, '0'),
).join('')
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n')

/** Shared browser/Node archive admission. Every registered file is checked before use. */
export async function readProjectArchive(bytes: Uint8Array) {
  const files = decodeProjectArchive(bytes)
  const readJson = (path: string) => {
    const bytes = files.get(path)
    if (!bytes) throw new Error(`project-file-missing:${path}`)
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  }
  const manifest = projectManifestSchema.parse(readJson('project.json'))
  const registered = assertManifestFiles(manifest)
  const allowed = new Set(['project.json', ...registered.map(file => file.path)])
  for (const path of files.keys()) if (!allowed.has(path)) throw new Error(`archive-unregistered-file:${path}`)
  for (const file of registered) {
    const bytes = files.get(file.path)
    if (!bytes || bytes.length !== file.bytes || await hashBytes(bytes) !== file.sha256) {
      throw new Error(`project-file-integrity:${file.path}`)
    }
  }
  const document = parseProjectDocument(readJson(manifest.document.path))
  const issues = inspectProjectDocument(document, manifest)
  if (issues.length) throw new Error(issues.map(i => `${i.code}:${i.path}`).join('\n'))
  return { manifest, document, files }
}

export function encodeProjectArchive(manifest: ProjectManifest, files: ReadonlyMap<string, Uint8Array>) {
  const entries: Record<string, Uint8Array> = Object.create(null)
  entries['project.json'] = jsonBytes(manifest)
  for (const file of assertManifestFiles(manifest)) {
    const bytes = files.get(file.path)
    if (!bytes) throw new Error(`project-file-missing:${file.path}`)
    entries[file.path] = bytes
  }
  return zipSync(entries, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') })
}

/** Cloud receives document resources only. Sources/reviews and session state stay local. */
export async function prepareProjectTransfer(bytes: Uint8Array) {
  const { manifest, document, files } = await readProjectArchive(bytes)
  const documentBytes = jsonBytes(document)
  const portable = { ...manifest, attachments: [], document: {
    path: 'document.json', bytes: documentBytes.length, sha256: await hashBytes(documentBytes),
  } }
  files.set('document.json', documentBytes)
  return encodeProjectArchive(portable, files)
}
