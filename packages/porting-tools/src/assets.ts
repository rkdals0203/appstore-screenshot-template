import { z } from 'zod/v4'
import { readProjectFile, sha256, writeProjectFile, writeRecord } from './files.js'
import { readRaster } from './raster.js'

/** Import host-tool output; this module neither calls a model nor asserts visual fidelity. */
export const assetSpecSchema = z.strictObject({
  id: z.string().min(1).max(200),
  method: z.enum(['original', 'extracted', 'generated', 'edited', 'outpainted']),
  description: z.string().min(1),
  sources: z.array(z.strictObject({ file: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  tool: z.string().min(1).optional(),
  inferredContent: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.method !== 'original' && !value.sources.length) ctx.addIssue({ code: 'custom', message: 'Derived assets require source references' })
  if (['generated', 'edited', 'outpainted'].includes(value.method) && !value.tool) ctx.addIssue({ code: 'custom', message: 'Record the tool that produced these bytes' })
})

export async function registerImageAsset(input: { directory: string; file: string; spec: unknown }) {
  const spec = assetSpecSchema.parse(input.spec)
  for (const source of spec.sources) await readProjectFile(input.directory, source.file, source.sha256)
  const image = await readRaster(input.file)
  const hash = sha256(image.bytes)
  const file = `assets/${hash}.${image.format}`
  await writeProjectFile(input.directory, file, image.bytes)
  const artifact = {
    schemaVersion: 1, ...spec, file, sha256: hash, bytes: image.bytes.length,
    width: image.width, height: image.height,
    provenance: 'operator-supplied' as const,
    visualReview: 'not-reviewed' as const,
    distributionRights: 'unverified' as const,
  }
  const record = await writeRecord(input.directory, 'assets/asset', artifact)
  return { record, artifact }
}
