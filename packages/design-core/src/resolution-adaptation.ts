import type { DesignDocument, DesignLayer } from './design-document'
import { transformDesignLayers } from './design-document-hierarchy'
import { resolutionAdaptationSchema, type ResolutionAdaptation } from './resolution-adaptation-schema'

export { resolutionAdaptationSchema, type ResolutionAdaptation } from './resolution-adaptation-schema'
const stable = (n: number) => Math.round(n * 1e9) / 1e9

/** Strict publication uses a reviewed base, not a previously resized derivative. */
export function assertResolutionAdaptationSource(document: DesignDocument): void {
  if (!document.resolutionAdaptation) return
  const policy = resolutionAdaptationSchema.parse(document.resolutionAdaptation)
  if (document.canvas.width !== policy.base.width || document.canvas.height !== policy.base.height) {
    throw new Error('resolution-source-must-use-base-canvas')
  }
  const slides = new Set(document.frames.map(slide => slide.id))
  const roots = new Map(document.frames.flatMap(slide => slide.children.map(layer => [layer.id, layer] as const)))
  for (const group of policy.groups) {
    if (!slides.has(group.anchor.slideId)) throw new Error(`resolution-anchor-missing:${group.id}`)
    for (const id of group.layerIds) {
      const layer = roots.get(id)
      if (!layer) throw new Error(`resolution-root-layer-missing:${id}`)
      if (group.mode === 'text-width' && layer.type !== 'TEXT') throw new Error(`resolution-text-rule-on-non-text:${id}`)
    }
  }
}

/**
 * Opt-in post-generation transform. This never restores a source snapshot: it
 * transforms the CURRENT edited geometry, copy, bindings and styles. The same
 * canonical height used by the editor is used here; physical export is uniform.
 * Shared anchors are deck coordinates, so a seam group cannot tear between HOME
 * slides. Missing rules/new user layers retain a home-centred uniform fallback.
 */
export function adaptDocumentToResolution(document: DesignDocument, presetId: string): DesignDocument {
  const raw = document.resolutionAdaptation
  if (!raw) return document
  const policy = resolutionAdaptationSchema.parse(raw)
  const preset = policy.presets.find(value => value.id === presetId)
  if (!preset) throw new Error(`resolution-preset-not-admitted:${presetId}`)
  const nextHeight = policy.base.height
  const nextWidth = nextHeight * preset.width / preset.height
  if (Math.abs(document.canvas.width - nextWidth) < 1e-9 && document.canvas.height === nextHeight) return document
  const before = document.canvas
  const currentScale = Math.min(before.width / policy.base.width, before.height / policy.base.height)
  const targetScale = Math.min(nextWidth / policy.base.width, nextHeight / policy.base.height)
  const ratio = targetScale / currentScale
  const slideIndex = new Map(document.frames.map(slide => [slide.id, slide.index]))
  const byLayer = new Map(policy.groups.flatMap(group => group.layerIds.map(id => [id, group] as const)))
  const groupForRoot = (layer: DesignLayer): ResolutionAdaptation['groups'][number] | undefined => {
    const direct = byLayer.get(layer.id)
    if (direct || layer.type !== 'GROUP') return direct
    const found = layer.children.map(groupForRoot).filter(value => value !== undefined)
    return found.length && found.every(value => value!.id === found[0]!.id) ? found[0] : undefined
  }
  let transformed = document
  for (const slide of document.frames) {
    for (const layer of slide.children) {
      const authored = groupForRoot(layer)
      const usable = authored && slideIndex.has(authored.anchor.slideId) ? authored : undefined
      const anchor = usable?.anchor ?? { slideId: slide.id, x: 0.5, y: 0.5 }
      const anchorSlide = slideIndex.get(anchor.slideId)!
      const oldStep = before.width + (before.gutter ?? 0)
      const newStep = nextWidth + (before.gutter ?? 0)
      const oldAnchorX = anchorSlide * oldStep + anchor.x * before.width
      const newAnchorX = anchorSlide * newStep + anchor.x * nextWidth
      const oldGlobalCenterX = slide.index * oldStep + layer.frame.x + layer.frame.width / 2
      const oldCenterY = layer.frame.y + layer.frame.height / 2
      const textWidth = usable?.mode === 'text-width' && layer.type === 'TEXT'
      const geometryScale = textWidth ? 1 : ratio
      const widthRatio = textWidth ? nextWidth / before.width : ratio
      const centerX = newAnchorX + (oldGlobalCenterX - oldAnchorX) * (textWidth ? widthRatio : ratio)
      const centerY = anchor.y * nextHeight + (oldCenterY - anchor.y * before.height) * geometryScale
      if (geometryScale !== 1) {
        transformed = transformDesignLayers(transformed, [layer.id], { kind: 'scale', scale: geometryScale, origin: { x: 0, y: 0 } }) ?? transformed
      }
      transformed = { ...transformed, frames: transformed.frames.map(current => current.id !== slide.id ? current : {
        ...current, children: current.children.map(candidate => candidate.id !== layer.id ? candidate : {
          ...candidate, frame: { x: stable(centerX - slide.index * newStep - layer.frame.width * widthRatio / 2),
            y: stable(centerY - layer.frame.height * geometryScale / 2), width: stable(layer.frame.width * widthRatio), height: stable(layer.frame.height * geometryScale) },
        } as DesignLayer),
      }) }
    }
  }
  return { ...transformed, canvas: { ...before, width: nextWidth, height: nextHeight } }
}
