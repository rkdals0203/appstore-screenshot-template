/**
 * Canonical cross-slide projection math shared by the live editor, export renderer, and
 * deterministic seam harness.
 *
 * A layer is stored exactly once on its HOME slide. Every other occurrence is a derived window
 * projection; callers must never persist the filtered slide copies returned here.
 */

import type { DesignLayer, DesignSlide } from './design-document'
import { hasImageTilt, resolveImagePlane } from './image-plane'
import { IDENTITY_DESIGN_TRANSFORM, designLayerLocalToParent, multiplyDesignTransforms, mapDesignFrameBounds, type DesignTransform2D } from './design-transform'

/**
 * Rotated-frame horizontal reach safety. A 2D rectangle is exact before this multiplier; mockup
 * projections can extend slightly past their authoring frame, so omission is riskier than an extra
 * derived render.
 */
const BLEED_SAFETY = 1.15

function horizontalReach(layer: DesignLayer, parent: DesignTransform2D): { min: number; max: number } {
  const tilted = layer.type === 'IMAGE' && hasImageTilt(layer)
  const local = tilted && layer.type === 'IMAGE' ? resolveImagePlane(layer).transform : designLayerLocalToParent(layer)
  const bounds = mapDesignFrameBounds(multiplyDesignTransforms(parent, local), layer.frame)
  const extra = tilted ? 0 : bounds.width * (BLEED_SAFETY - 1) / 2
  return { min: bounds.x - extra, max: bounds.x + bounds.width + extra }
}

/**
 * Horizontal translation that places a HOME slide layer inside `windowIndex`'s window, in the
 * window's coordinates. Every consumer that draws something at a layer's projected position
 * (renderer, selection chrome) must use this so they cannot drift apart.
 */
export function panoramaWindowOffsetX(
  homeIndex: number,
  windowIndex: number,
  slideWidth: number,
  gutter = 0,
): number {
  return (homeIndex - windowIndex) * (slideWidth + gutter)
}

/**
 * `projectionScope` belongs to the top-level canonical root. A HOME-only layer may paint outside its
 * own slide and be clipped there, but must never acquire a derived clone in another slide window.
 * Omitted keeps legacy documents geometry-driven.
 */
export function isHomeScopedPanoramaLayer(root: DesignLayer): boolean {
  return root.extensions?.crescreendo?.projectionScope === 'home'
}

/** Groups may have children outside their nominal frame, so projection reach includes descendants. */
export function designLayerReachesPanoramaWindow(
  layer: DesignLayer,
  shift: number,
  slideWidth: number,
  parent: DesignTransform2D = IDENTITY_DESIGN_TRANSFORM,
): boolean {
  if (!layer.visible) return false
  // Callers pass the top-level canonical root here; nested layers never carry the scope.
  if (shift !== 0 && isHomeScopedPanoramaLayer(layer)) return false
  const { min, max } = horizontalReach(layer, parent)
  if (max + shift > 0 && min + shift < slideWidth) return true
  if (layer.type === 'GROUP') {
    return layer.children.some((child) => (
      designLayerReachesPanoramaWindow(child, shift, slideWidth, multiplyDesignTransforms(parent, designLayerLocalToParent(layer)))
    ))
  }
  return false
}

export interface PanoramaSlideRender {
  /** HOME slide, or a derived shallow copy containing only top-level layers reaching the window. */
  slide: DesignSlide
  /** Translation from HOME slide coordinates into the target window, in design pixels. */
  offsetX: number
}

/**
 * Returns the canonical HOME slide plus every neighbouring HOME layer projection visible through
 * `windowIndex`. Output order follows deck order so live/export stacking is identical.
 */
export function panoramaSlidesForWindow(
  slides: readonly DesignSlide[],
  windowIndex: number,
  slideWidth: number,
  gutter = 0,
): PanoramaSlideRender[] {
  const out: PanoramaSlideRender[] = []
  for (const slide of slides) {
    if (!slide) continue
    if (slide.index === windowIndex) {
      out.push({ slide, offsetX: 0 })
      continue
    }
    const offsetX = panoramaWindowOffsetX(slide.index, windowIndex, slideWidth, gutter)
    const layers = slide.children.filter((layer) => (
      designLayerReachesPanoramaWindow(layer, offsetX, slideWidth)
    ))
    if (layers.length === 0) continue
    out.push({ slide: { ...slide, children: layers }, offsetX })
  }
  return out.sort((left, right) => left.slide.index - right.slide.index)
}

export interface PanoramaPaintSlice extends PanoramaSlideRender {
  key: string
  zBase: number
}

/**
 * Paint compiler-owned relation bands across the entire window, not only inside each HOME slide.
 * A later HOME background must not cover an earlier HOME object's projection. Unmarked documents
 * retain deck/layer order. These shallow slices are render-only; canonical ownership never changes.
 */
export function panoramaPaintSlicesForWindow(
  slides: readonly DesignSlide[],
  windowIndex: number,
  slideWidth: number,
  gutter = 0,
): PanoramaPaintSlice[] {
  const visible = panoramaSlidesForWindow(slides, windowIndex, slideWidth, gutter)
  // Explicit order is opt-in. Old documents retain their band/HOME semantics.
  // Keep single-layer slices so a later HOME slide cannot override deck order.
  if (visible.some(({ slide }) => slide.children.some(layer => layer.extensions?.crescreendo?.panoramaPaintIndex != null))) {
    return visible.flatMap(({ slide, offsetX }) => slide.children.map(layer => ({
      slide: { ...slide, children: [layer] }, offsetX,
      key: `${slide.id}:ordered:${layer.id}`, zBase: 0,
    }))).sort((a, b) => {
      const left = a.slide.children[0]!, right = b.slide.children[0]!
      return (left.extensions?.crescreendo?.panoramaPaintIndex ?? Number.MAX_SAFE_INTEGER)
        - (right.extensions?.crescreendo?.panoramaPaintIndex ?? Number.MAX_SAFE_INTEGER)
    }).map((slice, index) => ({ ...slice, zBase: index }))
  }
  const slices: PanoramaPaintSlice[] = []
  let zBase = 0
  for (const band of ['background', 'content', 'foreground'] as const) {
    for (const { slide, offsetX } of visible) {
      const layers = slide.children.filter((layer) => (
        (layer.extensions?.crescreendo?.panoramaPaintOrder ?? 'content') === band
      ))
      if (layers.length === 0) continue
      slices.push({
        slide: layers.length === slide.children.length ? slide : { ...slide, children: layers },
        offsetX,
        key: `${slide.id}:${band}`,
        zBase,
      })
      zBase += layers.length
    }
  }
  return slices
}
