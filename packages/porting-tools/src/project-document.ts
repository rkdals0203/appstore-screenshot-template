import { designDocumentSchema, documentTextStyles, type DesignDocument, type DesignLayer, type DesignPaint, type TextLayer } from '@crescreendo/design-core/document'
import type { ProjectManifest } from './project-schema.js'

export interface ProjectDiagnostic { code: string; path: string; message: string }

export function parseProjectDocument(value: unknown): DesignDocument {
  // Parse for validation/defaults, without writing the normalized result over the source.
  return designDocumentSchema.parse(value)
}

export function inspectProjectDocument(document: DesignDocument, project: ProjectManifest): ProjectDiagnostic[] {
  const issues: ProjectDiagnostic[] = []
  const issue = (code: string, path: string, message: string) => { issues.push({ code, path, message }) }
  const resources = new Map(project.resources.map(resource => [resource.id, resource]))
  const assets = new Set<string>()
  const nodes = new Map<string, DesignLayer | { type: 'FRAME' }>()
  const links: Array<{ source: string; path: string }> = []
  const styles = new Map(documentTextStyles(document).map(style => [style.id, style]))
  const imageRef = (reference: string, path: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:\/\/|data:|blob:|file:|\/|\.\.?\/)|\\/i.test(reference)) {
      issue('nonportable-asset', path, 'Use a stable asset ID, not a transport URL or file path')
      return
    }
    const id = reference.startsWith('asset:') ? reference.slice(6) : reference
    if (!assets.has(id)) issue('unknown-asset', path, `Document does not declare asset ${id}`)
    if (resources.get(id)?.kind !== 'image') issue('missing-image', path, `No local image for ${id}`)
  }
  for (const [index, asset] of document.assets.entries()) {
    if (assets.has(asset.id)) issue('duplicate-asset', `assets.${index}.id`, asset.id)
    assets.add(asset.id)
    if (asset.url !== undefined || asset.dataUri !== undefined) issue('nonportable-asset', `assets.${index}`, 'Use an asset ID and a project resource, not a URL or inline image')
    if (resources.get(asset.id)?.kind !== 'image') issue('missing-image', `assets.${index}`, `No local image for ${asset.id}`)
  }
  project.screenshots.forEach((id, index) => {
    // appImageIndex belongs to the host's ordered inputs, not document.assets.
    if (resources.get(id)?.kind !== 'image') issue('missing-screenshot', `project.screenshots.${index}`, `No local image for ${id}`)
  })
  const paints = (values: readonly DesignPaint[] | undefined, path: string) => {
    values?.forEach((paint, index) => { if (paint.type === 'IMAGE') imageRef(paint.assetRef, `${path}.${index}.assetRef`) })
  }
  const addNode = (node: DesignLayer | { id: string; type: 'FRAME' }, path: string) => {
    if (nodes.has(node.id)) issue('duplicate-node', path, node.id)
    nodes.set(node.id, node)
  }
  const font = (style: TextLayer['style'], text: string, path: string) => {
    if (!text.trim()) return
    const family = style.fontFamily?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').trim()
    if (!family) { issue('missing-font-family', path, 'Local text must name its font'); return }
    const rawWeight = style.fontWeight ?? 400
    const weight = rawWeight === 'normal' ? 400 : rawWeight === 'bold' ? 700 : Number(rawWeight)
    if (!Number.isFinite(weight) || weight < 1 || weight > 1000) { issue('invalid-font-weight', path, String(rawWeight)); return }
    const found = project.resources.some(resource => resource.kind === 'font'
      && resource.family.toLowerCase() === family.toLowerCase() && resource.style === (style.fontStyle ?? 'normal')
      && resource.weight[0] <= weight && resource.weight[1] >= weight)
    if (!found) issue('missing-font', path, `${family}, ${weight}, ${style.fontStyle ?? 'normal'} requires a local font file`)
  }
  const visit = (layers: DesignLayer[], path: string) => {
    layers.forEach((layer, index) => {
      const at = `${path}.${index}`
      addNode(layer, `${at}.id`)
      if ('fills' in layer) paints(layer.fills, `${at}.fills`)
      if ('strokes' in layer) paints(layer.strokes, `${at}.strokes`)
      if (layer.type === 'GROUP') visit(layer.children, `${at}.children`)
      if (layer.type === 'IMAGE' || layer.type === 'VECTOR') {
        if (layer.type === 'IMAGE' && layer.presentation?.kind === 'linkedMagnifier') {
          // This image is rendered from its source layer, not an independent asset file.
          links.push({ source: layer.presentation.sourceLayerId, path: `${at}.presentation.sourceLayerId` })
        } else if (layer.assetRef) imageRef(layer.assetRef, `${at}.assetRef`)
      }
      if (layer.type === 'MOCKUP') {
        if (layer.screenBinding.assetRef) imageRef(layer.screenBinding.assetRef, `${at}.screenBinding.assetRef`)
        const input = layer.screenBinding.appImageIndex
        if (input != null && !project.screenshots[input]) issue('missing-screenshot', `${at}.screenBinding.appImageIndex`, String(input))
        if (layer.device.frameStyle === 'mockup' && !project.resources.some(resource => resource.kind === 'model' && resource.device === layer.device.type)) {
          issue('missing-model', `${at}.device`, `No local GLB for ${layer.device.type}`)
        }
      }
      if (layer.type === 'TEXT') {
        const textStyle = layer.textStyleId ? styles.get(layer.textStyleId) : undefined
        if (layer.textStyleId && !textStyle) issue('unknown-text-style', `${at}.textStyleId`, layer.textStyleId)
        const base = { ...textStyle?.typography, ...layer.styleOverrides, ...layer.style }
        font(base, layer.characters, `${at}.style`)
        layer.styleRuns?.forEach((run, runIndex) => {
          const runAt = `${at}.styleRuns.${runIndex}`
          if (run.start > run.end || run.end > layer.characters.length) issue('invalid-text-range', runAt, 'Run is outside the text')
          paints(run.fills, `${runAt}.fills`)
          font({ ...base, ...run.style }, layer.characters.slice(run.start, run.end), `${runAt}.style`)
        })
      }
    })
  }
  document.frames.forEach((frame, index) => {
    const at = `frames.${index}`
    if (frame.index !== index) issue('invalid-frame-index', `${at}.index`, `Expected ${index}`)
    addNode(frame, `${at}.id`)
    paints(frame.fills, `${at}.fills`)
    visit(frame.children, `${at}.children`)
  })
  for (const link of links) {
    const source = nodes.get(link.source)
    if (!source || source.type !== 'MOCKUP') issue('invalid-linked-source', link.path, link.source)
  }
  return issues
}
