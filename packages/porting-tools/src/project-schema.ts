import { designDocumentSchemaVersion } from '@crescreendo/design-core/document'
import { z } from 'zod/v4'
import { assertProjectPath, FILE_LIMIT } from './project-path.js'

// The portable container consumes the single canonical document schema.
export const DOCUMENT_CONTRACT = `crescreendo.design.document-${designDocumentSchemaVersion}` as const
export const PROJECT_FORMAT = 'crescreendo.project' as const
export const OPERATIONS_VERSION = 1 as const
export const PROJECT_LIMIT = 512 * 1024 * 1024
export const PROJECT_FILE_LIMIT = 2048

const pathSchema = z.string().max(600).refine(value => {
  try { assertProjectPath(value); return true } catch { return false }
}, 'Expected a portable relative path')
export const fileReferenceSchema = z.object({
  path: pathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative().max(FILE_LIMIT),
}).strict()
const resourceBase = fileReferenceSchema.extend({ id: z.string().min(1).max(160) })
export const projectResourceSchema = z.discriminatedUnion('kind', [
  resourceBase.extend({ kind: z.literal('image') }).strict(),
  resourceBase.extend({
    kind: z.literal('font'), family: z.string().min(1).max(200),
    weight: z.tuple([z.number().int().min(1).max(1000), z.number().int().min(1).max(1000)]),
    style: z.enum(['normal', 'italic']),
  }).strict(),
  resourceBase.extend({ kind: z.literal('model'), device: z.string().min(1).max(160) }).strict(),
])
export const projectSpecSchema = z.object({
  title: z.string().min(1).max(200),
  resources: z.array(projectResourceSchema).max(PROJECT_FILE_LIMIT),
  /** The existing document's appImageIndex resolves into this ordered ID list. */
  screenshots: z.array(z.string().min(1).max(160)).max(PROJECT_FILE_LIMIT).default([]),
  attachments: z.array(fileReferenceSchema).max(PROJECT_FILE_LIMIT).default([]),
}).strict()
export const projectManifestSchema = projectSpecSchema.extend({
  format: z.literal(PROJECT_FORMAT), containerVersion: z.literal(1),
  document: fileReferenceSchema,
  compatibility: z.object({
    documentContract: z.literal(DOCUMENT_CONTRACT),
    operations: z.literal(OPERATIONS_VERSION),
  }).strict(),
}).strict()

export type ProjectSpec = z.input<typeof projectSpecSchema>
export type ProjectManifest = z.infer<typeof projectManifestSchema>
export type ProjectResource = z.infer<typeof projectResourceSchema>
export type ProjectFileReference = z.infer<typeof fileReferenceSchema>

export function projectFiles(manifest: ProjectManifest): ProjectFileReference[] {
  return [...manifest.resources, ...manifest.attachments]
}

export function assertManifestFiles(manifest: ProjectManifest) {
  if (manifest.document.path !== 'document.json' && !/^documents\/[a-f0-9]{64}\.json$/.test(manifest.document.path)) {
    throw new Error('document-path-invalid')
  }
  const paths = new Map<string, ProjectFileReference>()
  const ids = new Set<string>()
  const fonts = new Set<string>()
  const models = new Set<string>()
  for (const resource of manifest.resources) {
    if (!resource.path.startsWith('assets/')) throw new Error(`resource-path-outside-assets:${resource.id}`)
    if (ids.has(resource.id)) throw new Error(`duplicate-resource-id:${resource.id}`)
    ids.add(resource.id)
    if (resource.kind === 'font') {
      if (resource.weight[0] > resource.weight[1]) throw new Error(`invalid-font-weight-range:${resource.id}`)
      const key = JSON.stringify([resource.family.toLowerCase(), resource.style, resource.weight])
      if (fonts.has(key)) throw new Error(`duplicate-font-face:${resource.id}`)
      fonts.add(key)
    }
    if (resource.kind === 'model') {
      if (models.has(resource.device)) throw new Error(`duplicate-device-model:${resource.device}`)
      models.add(resource.device)
    }
  }
  for (const file of manifest.attachments) {
    if (!/^(source|review|exports)\//.test(file.path) && !/^assets\/asset-[a-f0-9]{64}\.json$/.test(file.path)) {
      throw new Error(`attachment-path-invalid:${file.path}`)
    }
  }
  for (const file of [manifest.document, ...projectFiles(manifest)]) {
    const key = file.path.normalize('NFC').toLowerCase()
    const previous = paths.get(key)
    if (previous && (previous.path !== file.path || previous.sha256 !== file.sha256 || previous.bytes !== file.bytes)) {
      throw new Error(`conflicting-file-reference:${file.path}`)
    }
    paths.set(key, file)
  }
  if (paths.size + 2 > PROJECT_FILE_LIMIT) throw new Error('project-too-many-files')
  if ([...paths.values()].reduce((sum, file) => sum + file.bytes, 0) > PROJECT_LIMIT) throw new Error('project-too-large')
  return [...paths.values()]
}
