import type {
  DesignDocument,
  DesignEffect,
  DesignFrame,
  DesignLayer,
  DesignSlide,
  TextLayer,
} from './design-document'
import {
  IDENTITY_DESIGN_TRANSFORM,
  aroundDesignPoint,
  designLayerLocalToParent,
  frameFromRigidDesignTransform,
  invertDesignTransform,
  mapDesignFrameBounds,
  mapDesignPoint,
  multiplyDesignTransforms,
  rotateDesignTransform,
  scaleDesignTransform,
  translateDesignTransform,
  type DesignPoint,
  type DesignTransform2D,
} from './design-transform'
import { isShapeLayer } from './design-document'

export interface DesignLayerLocation {
  slide: DesignSlide
  slideIndex: number
  layer: DesignLayer
  parentGroup: DesignLayer | null
  parentGroupIds: string[]
  ancestry: DesignLayer[]
  siblingIndex: number
  siblingCount: number
  parentToSlide: DesignTransform2D
  localToSlide: DesignTransform2D
}

interface LayerListLocationContext {
  slide: DesignSlide
  parentGroup: DesignLayer | null
  ancestry: DesignLayer[]
  parentToSlide: DesignTransform2D
}

function findLocationInLayers(
  layers: readonly DesignLayer[],
  layerId: string,
  context: LayerListLocationContext,
): DesignLayerLocation | null {
  for (let siblingIndex = 0; siblingIndex < layers.length; siblingIndex += 1) {
    const layer = layers[siblingIndex]
    const localToSlide = multiplyDesignTransforms(
      context.parentToSlide,
      designLayerLocalToParent(layer),
    )
    if (layer.id === layerId) {
      return {
        slide: context.slide,
        slideIndex: context.slide.index,
        layer,
        parentGroup: context.parentGroup,
        parentGroupIds: context.ancestry.map((ancestor) => ancestor.id),
        ancestry: context.ancestry,
        siblingIndex,
        siblingCount: layers.length,
        parentToSlide: context.parentToSlide,
        localToSlide,
      }
    }
    if (layer.type !== 'GROUP') continue
    const child = findLocationInLayers(layer.children, layerId, {
      slide: context.slide,
      parentGroup: layer,
      ancestry: [...context.ancestry, layer],
      parentToSlide: localToSlide,
    })
    if (child) return child
  }
  return null
}

export function findDesignLayerLocation(
  document: DesignDocument | undefined,
  layerId: string,
): DesignLayerLocation | null {
  if (!document) return null
  for (const slide of document.frames) {
    const location = findLocationInLayers(slide.children, layerId, {
      slide,
      parentGroup: null,
      ancestry: [],
      parentToSlide: IDENTITY_DESIGN_TRANSFORM,
    })
    if (location) return location
  }
  return null
}

export function normalizeSelectionRoots(
  document: DesignDocument | undefined,
  layerIds: readonly string[],
): string[] {
  if (!document) return []
  const uniqueIds = [...new Set(layerIds)]
  const selected = new Set(uniqueIds)
  return uniqueIds.filter((layerId) => {
    const location = findDesignLayerLocation(document, layerId)
    if (!location) return false
    return !location.parentGroupIds.some((parentId) => selected.has(parentId))
  })
}

function replaceLayersAtParent(
  document: DesignDocument,
  slideIndex: number,
  parentGroupIds: readonly string[],
  update: (layers: readonly DesignLayer[]) => DesignLayer[],
): DesignDocument | null {
  let applied = false
  const updateGroupLayers = (
    layers: readonly DesignLayer[],
    depth: number,
  ): DesignLayer[] => {
    if (depth === parentGroupIds.length) {
      applied = true
      return update(layers)
    }
    const parentId = parentGroupIds[depth]
    return layers.map((layer) => {
      if (layer.id !== parentId || layer.type !== 'GROUP') return layer
      return { ...layer, children: updateGroupLayers(layer.children, depth + 1) }
    })
  }
  const slides = document.frames.map((slide) => {
    if (slide.index !== slideIndex) return slide
    return { ...slide, children: updateGroupLayers(slide.children, 0) }
  })
  return applied ? { ...document, frames: slides } : null
}

function selectedBoundsInParent(locations: readonly DesignLayerLocation[]): DesignFrame {
  const bounds = locations.map((location) =>
    mapDesignFrameBounds(
      designLayerLocalToParent(location.layer),
      location.layer.frame,
    ))
  const minX = Math.min(...bounds.map((frame) => frame.x))
  const minY = Math.min(...bounds.map((frame) => frame.y))
  const maxX = Math.max(...bounds.map((frame) => frame.x + frame.width))
  const maxY = Math.max(...bounds.map((frame) => frame.y + frame.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export interface GroupDesignLayersOptions {
  createId?: () => string
  name?: string
}

export interface GroupDesignLayersResult {
  document: DesignDocument
  group: Extract<DesignLayer, { type: 'GROUP' }>
}

export function groupDesignLayers(
  document: DesignDocument,
  layerIds: readonly string[],
  options: GroupDesignLayersOptions = {},
): GroupDesignLayersResult | null {
  const roots = normalizeSelectionRoots(document, layerIds)
  if (roots.length < 2) return null
  const locations = roots
    .map((layerId) => findDesignLayerLocation(document, layerId))
    .filter((location): location is DesignLayerLocation => location !== null)
  if (locations.length !== roots.length) return null
  const first = locations[0]
  if (locations.some((location) =>
    location.slideIndex !== first.slideIndex
    || location.parentGroup?.id !== first.parentGroup?.id)) return null

  const ordered = locations.toSorted((left, right) => left.siblingIndex - right.siblingIndex)
  const selectedIds = new Set(ordered.map((location) => location.layer.id))
  const bounds = selectedBoundsInParent(ordered)
  const group: Extract<DesignLayer, { type: 'GROUP' }> = {
    id: options.createId?.() ?? `group-${crypto.randomUUID().slice(0, 8)}`,
    type: 'GROUP',
    name: options.name ?? 'Group',
    frame: bounds,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    provenance: {
      createdBy: 'user',
      operation: 'group',
    },
    children: ordered.map(({ layer }) => ({
      ...layer,
      frame: {
        ...layer.frame,
        x: layer.frame.x - bounds.x,
        y: layer.frame.y - bounds.y,
      },
    } as DesignLayer)),
  }
  const insertionIndex = Math.max(...ordered.map((location) => location.siblingIndex))
  const next = replaceLayersAtParent(
    document,
    first.slideIndex,
    first.parentGroupIds,
    (siblings) => {
      const remaining = siblings.filter((layer) => !selectedIds.has(layer.id))
      const removedBeforeInsertion = siblings
        .slice(0, insertionIndex + 1)
        .filter((layer) => selectedIds.has(layer.id)).length
      const nextIndex = insertionIndex + 1 - removedBeforeInsertion
      return [
        ...remaining.slice(0, nextIndex),
        group,
        ...remaining.slice(nextIndex),
      ]
    },
  )
  return next ? { document: next, group } : null
}

export interface UngroupDesignLayerResult {
  document: DesignDocument
  layers: DesignLayer[]
}

export function ungroupDesignLayer(
  document: DesignDocument,
  groupId: string,
): UngroupDesignLayerResult | null {
  const location = findDesignLayerLocation(document, groupId)
  if (!location || location.layer.type !== 'GROUP') return null
  const group = location.layer
  const ungrouped = group.children.map((child) => {
    const combined = multiplyDesignTransforms(
      designLayerLocalToParent(group),
      designLayerLocalToParent(child),
    )
    const next = frameFromRigidDesignTransform(combined, child.frame.width, child.frame.height)
    return {
      ...child,
      frame: next.frame,
      rotation: next.rotation,
      opacity: child.opacity * group.opacity,
      visible: child.visible && group.visible,
    } as DesignLayer
  })
  const next = replaceLayersAtParent(
    document,
    location.slideIndex,
    location.parentGroupIds,
    (siblings) => [
      ...siblings.slice(0, location.siblingIndex),
      ...ungrouped,
      ...siblings.slice(location.siblingIndex + 1),
    ],
  )
  return next ? { document: next, layers: ungrouped } : null
}

function containsLayerId(layer: DesignLayer, layerId: string): boolean {
  if (layer.id === layerId) return true
  return layer.type === 'GROUP' && layer.children.some((child) => containsLayerId(child, layerId))
}

function removeLayerAtLocation(
  document: DesignDocument,
  location: DesignLayerLocation,
): DesignDocument | null {
  return replaceLayersAtParent(
    document,
    location.slideIndex,
    location.parentGroupIds,
    (siblings) => siblings.filter((layer) => layer.id !== location.layer.id),
  )
}

export interface ReparentDesignLayerOptions {
  parentGroupId: string | null
  siblingIndex?: number
}

export function reparentDesignLayer(
  document: DesignDocument,
  layerId: string,
  options: ReparentDesignLayerOptions,
): DesignDocument | null {
  const source = findDesignLayerLocation(document, layerId)
  if (!source) return null
  const target = options.parentGroupId
    ? findDesignLayerLocation(document, options.parentGroupId)
    : null
  if (options.parentGroupId && (!target || target.layer.type !== 'GROUP')) return null
  if (target && target.slideIndex !== source.slideIndex) return null
  if (target && containsLayerId(source.layer, target.layer.id)) return null
  if (source.parentGroup?.id === options.parentGroupId) {
    const targetIndex = options.siblingIndex ?? source.siblingCount - 1
    if (targetIndex === source.siblingIndex) return document
  }

  const targetParentToSlide = target?.localToSlide ?? IDENTITY_DESIGN_TRANSFORM
  const localToTarget = multiplyDesignTransforms(
    invertDesignTransform(targetParentToSlide),
    source.localToSlide,
  )
  const placement = frameFromRigidDesignTransform(
    localToTarget,
    source.layer.frame.width,
    source.layer.frame.height,
  )
  const movedLayer: DesignLayer = {
    ...source.layer,
    frame: placement.frame,
    rotation: placement.rotation,
  } as DesignLayer
  const removed = removeLayerAtLocation(document, source)
  if (!removed) return null

  const targetAfterRemoval = options.parentGroupId
    ? findDesignLayerLocation(removed, options.parentGroupId)
    : null
  const parentPath = targetAfterRemoval
    ? [...targetAfterRemoval.parentGroupIds, targetAfterRemoval.layer.id]
    : []
  return replaceLayersAtParent(
    removed,
    source.slideIndex,
    parentPath,
    (siblings) => {
      const index = Math.max(0, Math.min(options.siblingIndex ?? siblings.length, siblings.length))
      return [...siblings.slice(0, index), movedLayer, ...siblings.slice(index)]
    },
  )
}

function scaleCssLength(value: string | number | undefined, scale: number): string | number | undefined {
  if (typeof value === 'number') return value * scale
  if (typeof value !== 'string') return value
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/)
  return match ? `${Number(match[1]) * scale}px` : value
}

function scaleLineHeight(value: string | number | undefined, scale: number): string | number | undefined {
  // CSS unitless line-height is a multiplier. Font-size scaling already scales
  // its rendered pixels, so multiplying the ratio again would double-scale it.
  if (typeof value === 'number' && value <= 4) return value
  return scaleCssLength(value, scale)
}

function scaleEffects(effects: readonly DesignEffect[], scale: number): DesignEffect[] {
  return effects.map((effect) => effect.type === 'DROP_SHADOW'
    ? {
        ...effect,
        offset: { x: effect.offset.x * scale, y: effect.offset.y * scale },
        radius: effect.radius * scale,
        spread: effect.spread * scale,
      }
    : { ...effect, radius: effect.radius * scale })
}

function scaleTextTypography(layer: TextLayer, scale: number): Pick<TextLayer, 'style' | 'styleOverrides' | 'styleRuns'> {
  const scaleTypography = <T extends TextLayer['style']>(typography: T): T => ({
    ...typography,
    fontSize: typography.fontSize === undefined ? undefined : typography.fontSize * scale,
    lineHeight: scaleLineHeight(typography.lineHeight, scale),
    letterSpacing: scaleCssLength(typography.letterSpacing, scale),
  }) as T
  const typography = scaleTypography(layer.style)
  const scaledExistingOverrides = layer.styleOverrides
    ? scaleTypography(layer.styleOverrides)
    : undefined
  // Linked text styles are materialized into layer.typography. Scale is a
  // per-layer visual operation, so size-bearing style values must become local
  // overrides; otherwise the next deck-wide style update would snap the text
  // back to its unscaled size while its frame stays scaled.
  const typographyOverrides = layer.textStyleId
    ? {
        ...scaledExistingOverrides,
        ...(typography.fontSize !== undefined ? { fontSize: typography.fontSize } : {}),
        ...(typography.lineHeight !== undefined ? { lineHeight: typography.lineHeight } : {}),
        ...(typography.letterSpacing !== undefined ? { letterSpacing: typography.letterSpacing } : {}),
      }
    : scaledExistingOverrides
  return {
    style: typography,
    styleOverrides: typographyOverrides && Object.keys(typographyOverrides).length > 0
      ? typographyOverrides
      : undefined,
    styleRuns: layer.styleRuns?.map((run) => ({
      ...run,
      style: run.style ? scaleTypography(run.style) : undefined,
    })),
  }
}

function scaleLayerGeometry(
  layer: DesignLayer,
  scale: number,
  scalePosition: boolean,
): DesignLayer {
  const frame = {
    x: scalePosition ? layer.frame.x * scale : layer.frame.x,
    y: scalePosition ? layer.frame.y * scale : layer.frame.y,
    width: layer.frame.width * scale,
    height: layer.frame.height * scale,
  }
  if (layer.type === 'GROUP') {
    return {
      ...layer,
      frame,
      children: layer.children.map((child) => scaleLayerGeometry(child, scale, true)),
    }
  }
  const effects = scaleEffects(layer.effects, scale)
  if (layer.type === 'TEXT') {
    return { ...layer, frame, effects, ...scaleTextTypography(layer, scale) }
  }
  if (layer.type === 'IMAGE') {
    return {
      ...layer,
      frame,
      cornerRadius: layer.cornerRadius === undefined ? undefined : layer.cornerRadius * scale,
      filters: {
        ...layer.filters,
        blur: layer.filters.blur === undefined ? undefined : layer.filters.blur * scale,
      },
      effects,
    }
  }
  if (isShapeLayer(layer)) {
    return {
      ...layer,
      frame,
      cornerRadius: layer.cornerRadius === undefined ? undefined : layer.cornerRadius * scale,
      strokeWeight: layer.strokeWeight * scale,
      points: layer.points?.map((point) => ({ x: point.x * scale, y: point.y * scale })),
      effects,
    }
  }
  if (layer.type === 'MOCKUP') {
    return {
      ...layer,
      frame,
      frameStyle: {
        ...layer.frameStyle,
        borderRadius: layer.frameStyle.borderRadius === undefined
          ? undefined
          : layer.frameStyle.borderRadius * scale,
        bezelWidth: layer.frameStyle.bezelWidth === undefined
          ? undefined
          : layer.frameStyle.bezelWidth * scale,
      },
      shadow: {
        ...layer.shadow,
        blur: layer.shadow.blur === undefined ? undefined : layer.shadow.blur * scale,
        offsetY: layer.shadow.offsetY === undefined ? undefined : layer.shadow.offsetY * scale,
      },
      effects,
    }
  }
  return { ...layer, frame, effects }
}

/** Resize changes layout geometry only. Appearance values (font/stroke/radius/effects)
 * remain untouched; nested group coordinates still have to follow the resized group. */
function resizeLayerGeometry(
  layer: DesignLayer,
  scaleX: number,
  scaleY: number,
  scalePosition: boolean,
): DesignLayer {
  const frame = {
    x: scalePosition ? layer.frame.x * scaleX : layer.frame.x,
    y: scalePosition ? layer.frame.y * scaleY : layer.frame.y,
    width: layer.frame.width * scaleX,
    height: layer.frame.height * scaleY,
  }
  if (layer.type === 'GROUP') {
    return {
      ...layer,
      frame,
      children: layer.children.map((child) => resizeLayerGeometry(child, scaleX, scaleY, true)),
    }
  }
  if (isShapeLayer(layer) && layer.points) {
    return {
      ...layer,
      frame,
      points: layer.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
    }
  }
  if (layer.type === 'TEXT') {
    if (scaleY !== 1) return { ...layer, frame, textAutoResize: 'NONE' }
    if (scaleX !== 1 && layer.textAutoResize === 'WIDTH_AND_HEIGHT') {
      return { ...layer, frame, textAutoResize: 'HEIGHT' }
    }
  }
  return { ...layer, frame } as DesignLayer
}

export type DesignLayerTransformOperation =
  | { kind: 'translate'; delta: DesignPoint }
  | { kind: 'rotate'; degrees: number; origin: DesignPoint }
  | { kind: 'scale'; scale: number; origin: DesignPoint }

function worldOperationTransform(operation: DesignLayerTransformOperation): DesignTransform2D {
  if (operation.kind === 'translate') {
    return translateDesignTransform(operation.delta.x, operation.delta.y)
  }
  if (operation.kind === 'rotate') {
    return aroundDesignPoint(rotateDesignTransform(operation.degrees), operation.origin)
  }
  return aroundDesignPoint(scaleDesignTransform(operation.scale), operation.origin)
}

function updateLayersById(
  layers: readonly DesignLayer[],
  replacements: ReadonlyMap<string, DesignLayer>,
): DesignLayer[] {
  return layers.map((layer) => {
    const replacement = replacements.get(layer.id)
    if (replacement) return replacement
    if (layer.type !== 'GROUP') return layer
    const children = updateLayersById(layer.children, replacements)
    return children.some((child, index) => child !== layer.children[index])
      ? { ...layer, children: children }
      : layer
  })
}

export function transformDesignLayers(
  document: DesignDocument,
  layerIds: readonly string[],
  operation: DesignLayerTransformOperation,
): DesignDocument | null {
  const roots = normalizeSelectionRoots(document, layerIds)
  if (roots.length === 0) return null
  if (operation.kind === 'scale' && (!Number.isFinite(operation.scale) || operation.scale <= 0)) {
    return null
  }
  const locations = roots
    .map((layerId) => findDesignLayerLocation(document, layerId))
    .filter((location): location is DesignLayerLocation => location !== null)
  if (locations.length !== roots.length) {
    return null
  }
  const worldTransform = worldOperationTransform(operation)
  const replacements = new Map<string, DesignLayer>()
  for (const location of locations) {
    const scale = operation.kind === 'scale' ? operation.scale : 1
    const width = location.layer.frame.width * scale
    const height = location.layer.frame.height * scale
    const placement = operation.kind === 'scale'
      ? (() => {
          // Uniform scale changes the layer's world centre and dimensions, but it must not leave
          // scale in the layer transform itself. Passing a scaled matrix to
          // frameFromRigidDesignTransform together with already-scaled dimensions applies the
          // scale twice and makes the fixed opposite corner drift on rotated groups.
          const worldCenter = mapDesignPoint(location.localToSlide, {
            x: location.layer.frame.width / 2,
            y: location.layer.frame.height / 2,
          })
          const nextWorldCenter = mapDesignPoint(worldTransform, worldCenter)
          const nextLocalCenter = mapDesignPoint(
            invertDesignTransform(location.parentToSlide),
            nextWorldCenter,
          )
          return {
            frame: {
              x: nextLocalCenter.x - width / 2,
              y: nextLocalCenter.y - height / 2,
              width,
              height,
            },
            rotation: location.layer.rotation,
          }
        })()
      : (() => {
          const nextWorld = multiplyDesignTransforms(worldTransform, location.localToSlide)
          const nextLocal = multiplyDesignTransforms(
            invertDesignTransform(location.parentToSlide),
            nextWorld,
          )
          return frameFromRigidDesignTransform(nextLocal, width, height)
        })()
    const scaled = operation.kind === 'scale'
      ? scaleLayerGeometry(location.layer, scale, false)
      : location.layer
    replacements.set(location.layer.id, {
      ...scaled,
      frame: placement.frame,
      rotation: placement.rotation,
    } as DesignLayer)
  }
  return {
    ...document,
    frames: document.frames.map((slide) => ({
      ...slide,
      children: updateLayersById(slide.children, replacements),
    })),
  }
}

export function resizeDesignLayers(
  document: DesignDocument,
  layerIds: readonly string[],
  options: {
    startBounds: DesignFrame
    targetBounds: DesignFrame
  },
): DesignDocument | null {
  const roots = normalizeSelectionRoots(document, layerIds)
  if (roots.length === 0) return null
  const start = options.startBounds
  const target = options.targetBounds
  if (
    start.width <= 0
    || start.height <= 0
    || target.width <= 0
    || target.height <= 0
    || ![start.x, start.y, start.width, start.height, target.x, target.y, target.width, target.height]
      .every(Number.isFinite)
  ) return null
  const scaleX = target.width / start.width
  const scaleY = target.height / start.height
  const locations = roots
    .map((layerId) => findDesignLayerLocation(document, layerId))
    .filter((location): location is DesignLayerLocation => location !== null)
  if (locations.length !== roots.length) return null

  const replacements = new Map<string, DesignLayer>()
  for (const location of locations) {
    const worldCenter = designLayerWorldCenter(location)
    const nextWorldCenter = {
      x: target.x + (worldCenter.x - start.x) * scaleX,
      y: target.y + (worldCenter.y - start.y) * scaleY,
    }
    const nextLocalCenter = mapDesignPoint(
      invertDesignTransform(location.parentToSlide),
      nextWorldCenter,
    )
    const resized = resizeLayerGeometry(location.layer, scaleX, scaleY, false)
    replacements.set(location.layer.id, {
      ...resized,
      frame: {
        x: nextLocalCenter.x - resized.frame.width / 2,
        y: nextLocalCenter.y - resized.frame.height / 2,
        width: resized.frame.width,
        height: resized.frame.height,
      },
    } as DesignLayer)
  }
  return {
    ...document,
    frames: document.frames.map((slide) => ({
      ...slide,
      children: updateLayersById(slide.children, replacements),
    })),
  }
}

export function designLayerWorldBounds(location: DesignLayerLocation): DesignFrame {
  return mapDesignFrameBounds(location.localToSlide, location.layer.frame)
}

export function designLayersWorldBounds(
  document: DesignDocument,
  layerIds: readonly string[],
): DesignFrame | null {
  const bounds = normalizeSelectionRoots(document, layerIds)
    .map((layerId) => findDesignLayerLocation(document, layerId))
    .filter((location): location is DesignLayerLocation => location !== null)
    .map(designLayerWorldBounds)
  if (bounds.length === 0) return null
  const minX = Math.min(...bounds.map((frame) => frame.x))
  const minY = Math.min(...bounds.map((frame) => frame.y))
  const maxX = Math.max(...bounds.map((frame) => frame.x + frame.width))
  const maxY = Math.max(...bounds.map((frame) => frame.y + frame.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function designLayerWorldCenter(location: DesignLayerLocation): DesignPoint {
  return mapDesignPoint(location.localToSlide, {
    x: location.layer.frame.width / 2,
    y: location.layer.frame.height / 2,
  })
}
