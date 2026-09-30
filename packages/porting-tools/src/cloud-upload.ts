import { z } from 'zod'
import { readProjectFile } from './files.js'
import { projectResourceSchema } from './project-schema.js'

const preparedSchema = z.object({
  uploadId: z.string().uuid(),
  url: z.string().url(),
  ticket: z.string().min(1),
  partBytes: z.number().int().min(1).max(16 * 1024 * 1024),
  expiresAt: z.number().int(),
  resource: projectResourceSchema,
})

/** Transfer only the exact file authorized by prepare_upload. Never print the ticket. */
export async function uploadCloudResource(input: {
  directory: string
  prepared: unknown
  appOrigin: string
  signal?: AbortSignal
}) {
  const prepared = preparedSchema.parse(input.prepared)
  const origin = new URL(input.appOrigin)
  const url = new URL(prepared.url)
  if (origin.href !== `${origin.origin}/` || origin.username || origin.password ||
    (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) ||
    url.origin !== origin.origin || url.username || url.password || url.search || url.hash ||
    url.pathname !== `/api/cloud/uploads/${prepared.uploadId}`) {
    throw new Error('upload-destination-mismatch')
  }
  const bytes = await readProjectFile(input.directory, prepared.resource.path, prepared.resource.sha256)
  if (bytes.length !== prepared.resource.bytes) throw new Error('upload-file-size-mismatch')
  const parts = Math.ceil(bytes.length / prepared.partBytes)
  for (let part = 0; part < parts; part++) {
    input.signal?.throwIfAborted()
    if (prepared.expiresAt <= Date.now()) throw new Error('upload-ticket-expired: repeat prepare_upload with the same request ID')
    const target = new URL(url)
    target.searchParams.set('part', String(part))
    const chunk = bytes.subarray(part * prepared.partBytes, (part + 1) * prepared.partBytes)
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000)
    const response = await fetch(target, {
      method: 'PUT',
      redirect: 'error',
      signal,
      headers: { authorization: `Bearer ${prepared.ticket}`, 'content-type': 'application/octet-stream' },
      body: new Uint8Array(chunk),
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`upload-part-failed:${response.status}: retry the same upload after refreshing its ticket`)
  }
  return { uploadId: prepared.uploadId, transferred: true, bytes: bytes.length, parts, next: 'finalize_upload' }
}
