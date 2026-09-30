import type { DesignDocument, DesignLayer } from './design-document'
import { filterDesignLayerPatchByPolicy } from './design-layer-patch-policy'
import { imageLayerSchema, isShapeLayer, isShapeLayerType } from './design-document'

export type DesignLayerReorderDirection = 'forward' | 'backward' | 'toFront' | 'toBack'

export interface DesignLayerSiblingLocation {
  layer: DesignLayer
  slideIndex: number
  index: number
  siblingCount: number
}

export function canMoveReorderIndex(
  targetIndex: number,
  length: number,
  direction: DesignLayerReorderDirection,
): boolean {
  if (targetIndex < 0 || length <= 1) return false
  if (direction === 'forward' || direction === 'toFront') return targetIndex < length - 1
  return targetIndex > 0
}

function removeDesignLayerFromList(
  layers: readonly DesignLayer[],
  layerId: string,
): { layers: DesignLayer[]; changed: boolean } {
  let changed = false
  const next: DesignLayer[] = []

  for (const layer of layers) {
    if (layer.id === layerId) {
      changed = true
      continue
    }
    if (layer.type === 'GROUP') {
      const childResult = removeDesignLayerFromList(layer.children, layerId)
      if (childResult.changed) {
        changed = true
        next.push({ ...layer, children: childResult.layers })
        continue
      }
    }
    next.push(layer)
  }

  return changed ? { layers: next, changed: true } : { layers: [...layers], changed: false }
}

export function removeDesignLayer(
  document: DesignDocument | undefined,
  layerId: string,
): DesignDocument | undefined {
  if (!document) return document
  let changed = false
  const slides = document.frames.map((slide) => {
    const result = removeDesignLayerFromList(slide.children, layerId)
    if (!result.changed) return slide
    changed = true
    return { ...slide, children: result.layers }
  })
  return changed ? { ...document, frames: slides } : document
}

function findDesignLayerLocationInList(
  layers: readonly DesignLayer[],
  layerId: string,
  slideIndex: number,
): DesignLayerSiblingLocation | null {
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]
    if (layer.id === layerId) {
      return { layer, slideIndex, index, siblingCount: layers.length }
    }
    if (layer.type === 'GROUP') {
      const child = findDesignLayerLocationInList(layer.children, layerId, slideIndex)
      if (child) return child
    }
  }
  return null
}

export function findDesignLayerSiblingLocation(
  document: DesignDocument | undefined,
  layerId: string,
): DesignLayerSiblingLocation | null {
  if (!document) return null
  for (const slide of document.frames) {
    const location = findDesignLayerLocationInList(slide.children, layerId, slide.index)
    if (location) return location
  }
  return null
}

export function cloneDesignLayerWithNewIds(
  layer: DesignLayer,
  opts?: {
    offset?: number
    isRoot?: boolean
    createId?: () => string
  },
): DesignLayer {
  const offset = opts?.offset ?? 0
  const isRoot = opts?.isRoot ?? true
  const createId = opts?.createId ?? (() => `layer-${crypto.randomUUID().slice(0, 8)}`)
  const nextFrame = isRoot
    ? { ...layer.frame, x: layer.frame.x + offset, y: layer.frame.y + offset }
    : layer.frame

  if (layer.type === 'GROUP') {
    return {
      ...layer,
      id: createId(),
      frame: nextFrame,
      children: layer.children.map((child) => cloneDesignLayerWithNewIds(child, {
        offset: 0,
        isRoot: false,
        createId,
      })),
    } as DesignLayer
  }

  return {
    ...layer,
    id: createId(),
    frame: nextFrame,
  } as DesignLayer
}

function insertDesignLayerAfter(
  layers: readonly DesignLayer[],
  sourceLayerId: string,
  clonedLayer: DesignLayer,
): { layers: DesignLayer[]; changed: boolean } {
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]
    if (layer.id === sourceLayerId) {
      return {
        layers: [
          ...layers.slice(0, index + 1),
          clonedLayer,
          ...layers.slice(index + 1),
        ],
        changed: true,
      }
    }
    if (layer.type === 'GROUP') {
      const childResult = insertDesignLayerAfter(layer.children, sourceLayerId, clonedLayer)
      if (childResult.changed) {
        return {
          layers: [
            ...layers.slice(0, index),
            { ...layer, children: childResult.layers },
            ...layers.slice(index + 1),
          ],
          changed: true,
        }
      }
    }
  }
  return { layers: [...layers], changed: false }
}

export function duplicateDesignLayer(
  document: DesignDocument | undefined,
  layerId: string,
  opts?: {
    offset?: number
    createId?: () => string
  },
): { document: DesignDocument; layer: DesignLayer } | null {
  const location = findDesignLayerSiblingLocation(document, layerId)
  if (!document || !location) return null
  const clonedLayer = cloneDesignLayerWithNewIds(location.layer, {
    offset: opts?.offset ?? 0,
    createId: opts?.createId,
  })
  let changed = false
  const slides = document.frames.map((slide) => {
    const result = insertDesignLayerAfter(slide.children, layerId, clonedLayer)
    if (!result.changed) return slide
    changed = true
    return { ...slide, children: result.layers }
  })
  return changed ? { document: { ...document, frames: slides }, layer: clonedLayer } : null
}

export function appendDesignLayerToSlide(
  document: DesignDocument,
  slideIndex: number,
  layer: DesignLayer,
): DesignDocument {
  return {
    ...document,
    frames: document.frames.map((slide) =>
      slide.index === slideIndex
        ? { ...slide, children: [...slide.children, layer] }
        : slide,
    ),
  }
}

function patchChangesLayer(layer: DesignLayer, patch: Partial<DesignLayer>): boolean {
  const record = layer as Record<string, unknown>
  return Object.entries(patch).some(([key, value]) => !Object.is(record[key], value))
}

function minDesignLayerFrameSize(
  layer: DesignLayer,
): { width: number; height: number } {
  if (layer.type === 'TEXT') {
    const fontSize = Number(layer.style.fontSize ?? 12)
    return {
      width: 40,
      height: Math.max(12, Number.isFinite(fontSize) ? fontSize * 0.75 : 12),
    }
  }
  if (isShapeLayer(layer) && layer.type === 'LINE') return { width: 24, height: 2 }
  if (layer.type === 'MOCKUP') return { width: 100, height: 100 }
  return { width: 24, height: 24 }
}

function sanitizeDesignLayerFramePatch(
  layer: DesignLayer,
  patch: Partial<DesignLayer>,
): Partial<DesignLayer> {
  const framePatch = patch.frame
  if (!framePatch || typeof framePatch !== 'object') return patch
  const min = minDesignLayerFrameSize(layer)
  const current = layer.frame
  const finiteOrCurrent = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const nextFrame = {
    x: finiteOrCurrent(framePatch.x, current.x),
    y: finiteOrCurrent(framePatch.y, current.y),
    width: Math.max(min.width, finiteOrCurrent(framePatch.width, current.width)),
    height: Math.max(min.height, finiteOrCurrent(framePatch.height, current.height)),
  }
  return { ...patch, frame: nextFrame } as Partial<DesignLayer>
}

/** A patch may switch between shape types (the former `shape` field); any other type change is ignored. */
function patchedLayerType(layer: DesignLayer, patch: Partial<DesignLayer>): DesignLayer['type'] {
  const next = (patch as { type?: unknown }).type
  return isShapeLayerType(layer.type) && isShapeLayerType(next) ? next : layer.type
}

function updateDesignLayerInList(
  layers: readonly DesignLayer[],
  layerId: string,
  patch: Partial<DesignLayer>,
  options: { bypassPolicy?: boolean },
): { layers: DesignLayer[]; changed: boolean } {
  let changed = false
  const nextLayers = layers.map((layer) => {
    if (layer.id === layerId) {
      const filteredPatch = options.bypassPolicy ? patch : filterDesignLayerPatchByPolicy(layer, patch)
      if (!filteredPatch || !patchChangesLayer(layer, filteredPatch)) return layer
      const safePatch = sanitizeDesignLayerFramePatch(layer, filteredPatch)
      if (!patchChangesLayer(layer, safePatch)) return layer
      const next = { ...layer, ...safePatch, id: layer.id, type: patchedLayerType(layer, safePatch) } as DesignLayer
      if (next.type === 'IMAGE' && ('tilt' in safePatch || 'presentation' in safePatch)) imageLayerSchema.parse(next)
      changed = true
      return next
    }
    if (layer.type !== 'GROUP') return layer
    const childResult = updateDesignLayerInList(layer.children, layerId, patch, options)
    if (!childResult.changed) return layer
    changed = true
    return { ...layer, children: childResult.layers } as DesignLayer
  })
  return { layers: changed ? nextLayers : [...layers], changed }
}

export function updateDesignLayer(
  document: DesignDocument | undefined,
  layerId: string,
  patch: Partial<DesignLayer>,
  options: { bypassPolicy?: boolean } = {},
): DesignDocument | undefined {
  if (!document) return document
  let changed = false
  const slides = document.frames.map((slide) => {
    const result = updateDesignLayerInList(slide.children, layerId, patch, options)
    if (!result.changed) return slide
    changed = true
    return { ...slide, children: result.layers }
  })
  return changed ? { ...document, frames: slides } : document
}

function collectDesignLayersById(
  layers: readonly DesignLayer[],
  targetIds: ReadonlySet<string>,
  out: Map<string, DesignLayer>,
): void {
  for (const layer of layers) {
    if (targetIds.has(layer.id)) out.set(layer.id, layer)
    if (layer.type === 'GROUP') collectDesignLayersById(layer.children, targetIds, out)
  }
}

function replaceDesignLayersInList(
  layers: readonly DesignLayer[],
  replacements: ReadonlyMap<string, DesignLayer>,
): { layers: DesignLayer[]; changed: boolean } {
  let changed = false
  const next = layers.map((layer) => {
    const replacement = replacements.get(layer.id) ?? layer
    if (replacement.type !== 'GROUP') {
      if (replacement !== layer) changed = true
      return replacement
    }
    const childResult = replaceDesignLayersInList(replacement.children, replacements)
    if (replacement !== layer || childResult.changed) {
      changed = true
      return childResult.changed ? { ...replacement, children: childResult.layers } : replacement
    }
    return layer
  })
  return { layers: changed ? next : [...layers], changed }
}

/**
 * Calculate every selected-layer replacement from one immutable document snapshot,
 * then rebuild the document tree once. The callback never observes an earlier
 * target's mutation, which is required for baseline-relative multi editing.
 */
export function updateDesignLayers(
  document: DesignDocument | undefined,
  layerIds: readonly string[],
  update: (layer: DesignLayer) => DesignLayer,
  options: { bypassPolicy?: boolean } = {},
): DesignDocument | undefined {
  if (!document || layerIds.length === 0) return document
  const targetIds = new Set(layerIds)
  const originals = new Map<string, DesignLayer>()
  for (const slide of document.frames) collectDesignLayersById(slide.children, targetIds, originals)
  const replacements = new Map<string, DesignLayer>()
  for (const [layerId, layer] of originals) {
    const candidate = update(layer)
    if (candidate === layer) continue
    const filteredPatch = options.bypassPolicy
      ? candidate
      : filterDesignLayerPatchByPolicy(layer, candidate)
    if (!filteredPatch) continue
    const safePatch = sanitizeDesignLayerFramePatch(layer, filteredPatch)
    if (!patchChangesLayer(layer, safePatch)) continue
    const next = {
      ...layer,
      ...safePatch,
      id: layer.id,
      type: patchedLayerType(layer, safePatch),
    } as DesignLayer
    if (next.type === 'IMAGE' && ('tilt' in safePatch || 'presentation' in safePatch)) imageLayerSchema.parse(next)
    replacements.set(layerId, next)
  }
  if (replacements.size === 0) return document
  let changed = false
  const slides = document.frames.map((slide) => {
    const result = replaceDesignLayersInList(slide.children, replacements)
    if (!result.changed) return slide
    changed = true
    return { ...slide, children: result.layers }
  })
  return changed ? { ...document, frames: slides } : document
}

function reorderDesignLayerInList(
  layers: readonly DesignLayer[],
  layerId: string,
  direction: DesignLayerReorderDirection,
): { layers: DesignLayer[]; changed: boolean } {
  const ownIndex = layers.findIndex((layer) => layer.id === layerId)
  if (ownIndex >= 0) {
    const targetIndex =
      direction === 'forward'
        ? ownIndex + 1
        : direction === 'backward'
          ? ownIndex - 1
          : direction === 'toFront'
            ? layers.length - 1
            : 0
    if (!canMoveReorderIndex(ownIndex, layers.length, direction) || targetIndex === ownIndex) {
      return { layers: [...layers], changed: false }
    }
    const next = layers.slice()
    const [layer] = next.splice(ownIndex, 1)
    next.splice(targetIndex, 0, layer)
    return { layers: next, changed: true }
  }

  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]
    if (layer.type !== 'GROUP') continue
    const childResult = reorderDesignLayerInList(layer.children, layerId, direction)
    if (childResult.changed) {
      return {
        layers: [
          ...layers.slice(0, index),
          { ...layer, children: childResult.layers },
          ...layers.slice(index + 1),
        ],
        changed: true,
      }
    }
  }

  return { layers: [...layers], changed: false }
}

/** Retain deck-wide slots when a HOME sibling list is reordered in the editor.
 * Otherwise persisted V4 paint indices would undo the user's visible reorder. */
function preservePanoramaReorder(before: DesignDocument, after: DesignDocument): DesignDocument {
  const roots = before.frames.flatMap(s => s.children)
  if (!roots.some(l => l.extensions?.crescreendo?.panoramaPaintIndex != null)) return after
  const ordered = [...roots].sort((a, b) => (a.extensions?.crescreendo?.panoramaPaintIndex ?? Number.MAX_SAFE_INTEGER)
    - (b.extensions?.crescreendo?.panoramaPaintIndex ?? Number.MAX_SAFE_INTEGER)).map(l => l.id)
  let changed = false
  for (const slide of after.frames) {
    const previous = before.frames.find(s => s.id === slide.id)!
    if (previous.children.every((l, index) => l.id === slide.children[index]?.id)) continue
    const members = new Set(previous.children.map(l => l.id))
    let index = 0
    for (let slot = 0; slot < ordered.length; slot++) if (members.has(ordered[slot]!)) ordered[slot] = slide.children[index++]!.id
    changed = true
  }
  if (!changed) return after
  const ranks = new Map(ordered.map((id, i) => [id, i]))
  return { ...after, frames: after.frames.map(s => ({ ...s,
    children: s.children.map(l => ({ ...l, extensions: { crescreendo: { ...l.extensions?.crescreendo, panoramaPaintIndex: ranks.get(l.id)! } } })),
  })) }
}

export function reorderDesignLayer(
  document: DesignDocument | undefined,
  layerId: string,
  direction: DesignLayerReorderDirection,
): DesignDocument | undefined {
  if (!document) return document
  let changed = false
  const slides = document.frames.map((slide) => {
    const result = reorderDesignLayerInList(slide.children, layerId, direction)
    if (!result.changed) return slide
    changed = true
    return { ...slide, children: result.layers }
  })
  return changed ? preservePanoramaReorder(document, { ...document, frames: slides }) : document
}

function reorderSelectedSiblings(
  layers: readonly DesignLayer[],
  selectedIds: ReadonlySet<string>,
  direction: DesignLayerReorderDirection,
): { layers: DesignLayer[]; changed: boolean; found: boolean } {
  const ownSelectedCount = layers.reduce(
    (count, layer) => count + (selectedIds.has(layer.id) ? 1 : 0),
    0,
  )

  if (ownSelectedCount > 0) {
    if (ownSelectedCount !== selectedIds.size) {
      return { layers: [...layers], changed: false, found: true }
    }

    const next = [...layers]
    if (direction === 'forward') {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (!selectedIds.has(next[index]!.id) || selectedIds.has(next[index + 1]!.id)) continue
        const current = next[index]!
        next[index] = next[index + 1]!
        next[index + 1] = current
      }
    } else if (direction === 'backward') {
      for (let index = 1; index < next.length; index += 1) {
        if (!selectedIds.has(next[index]!.id) || selectedIds.has(next[index - 1]!.id)) continue
        const current = next[index]!
        next[index] = next[index - 1]!
        next[index - 1] = current
      }
    } else {
      const selected = next.filter((layer) => selectedIds.has(layer.id))
      const unselected = next.filter((layer) => !selectedIds.has(layer.id))
      next.splice(
        0,
        next.length,
        ...(direction === 'toFront' ? [...unselected, ...selected] : [...selected, ...unselected]),
      )
    }

    const changed = next.some((layer, index) => layer !== layers[index])
    return { layers: next, changed, found: true }
  }

  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]
    if (layer.type !== 'GROUP') continue
    const childResult = reorderSelectedSiblings(layer.children, selectedIds, direction)
    if (!childResult.found) continue
    if (!childResult.changed) return { layers: [...layers], changed: false, found: true }
    return {
      layers: [
        ...layers.slice(0, index),
        { ...layer, children: childResult.layers },
        ...layers.slice(index + 1),
      ],
      changed: true,
      found: true,
    }
  }

  return { layers: [...layers], changed: false, found: false }
}

/**
 * Reorders normalized selection roots as one sibling-set operation. The roots
 * must share a slide and direct parent; selections spanning parents or slides
 * are intentionally left unchanged.
 */
export function reorderDesignLayers(
  document: DesignDocument | undefined,
  layerIds: readonly string[],
  direction: DesignLayerReorderDirection,
): DesignDocument | undefined {
  if (!document) return document
  const selectedIds = new Set(layerIds)
  if (selectedIds.size === 0) return document

  let changed = false
  let found = false
  const slides = document.frames.map((slide) => {
    if (found) return slide
    const result = reorderSelectedSiblings(slide.children, selectedIds, direction)
    if (!result.found) return slide
    found = true
    if (!result.changed) return slide
    changed = true
    return { ...slide, children: result.layers }
  })
  return changed ? preservePanoramaReorder(document, { ...document, frames: slides }) : document
}
