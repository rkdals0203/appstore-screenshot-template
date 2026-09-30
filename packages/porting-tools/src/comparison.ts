import sharp from 'sharp'
import { comparePixels, type PixelRect } from './pixel-comparison.js'
import { readRaster } from './raster.js'
import { sha256, writeProjectFile, writeRecord } from './files.js'

export async function compareImages(input: { source: string; rendered: string; directory: string; exclusions?: PixelRect[] }) {
  const [source, rendered] = await Promise.all([readRaster(input.source), readRaster(input.rendered)])
  if (source.width !== rendered.width || source.height !== rendered.height) throw new Error('comparison-dimensions-differ')
  const planes = await Promise.all([source, rendered].map(async raster => {
    const { data, info } = await sharp(raster.bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) }
  }))
  const { diff, ...metrics } = comparePixels(planes[0], planes[1], input.exclusions)
  const diffBytes = await sharp(Buffer.from(diff), { raw: { width: metrics.width, height: metrics.height, channels: 4 } }).png().toBuffer()
  // Capture the compared bytes so evidence survives edits or relocation of the original inputs.
  const sourceFile = `images/${sha256(source.bytes)}.${source.format}`
  const renderFile = `images/${sha256(rendered.bytes)}.${rendered.format}`
  const diffFile = `images/${sha256(diffBytes)}.png`
  await writeProjectFile(input.directory, sourceFile, source.bytes)
  await writeProjectFile(input.directory, renderFile, rendered.bytes)
  await writeProjectFile(input.directory, diffFile, diffBytes)
  const artifact = {
    schemaVersion: 1,
    source: { file: sourceFile, sha256: sha256(source.bytes) },
    rendered: { file: renderFile, sha256: sha256(rendered.bytes) },
    diff: { file: diffFile, sha256: sha256(diffBytes) },
    exclusions: input.exclusions ?? [],
    comparison: { ...metrics, alphaBackground: '#ffffff', changedPixelThreshold: 8, colourspace: 'srgb' },
  }
  const record = await writeRecord(input.directory, 'comparison', artifact)
  return { record, artifact }
}
