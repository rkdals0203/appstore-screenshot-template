import type { DesignGradientPaint, DesignLinearGradientPaint, DesignRadialGradientPaint } from './design-document'

/** Stored geometry, relative to the painted box. The paint type says which one it is. */
export type LinearGradientGeometry = NonNullable<DesignLinearGradientPaint['geometry']>
export type RadialGradientGeometry = NonNullable<DesignRadialGradientPaint['geometry']>
/** Editing view of a gradient's geometry, discriminated for the handle math below. */
export type GradientGeometry = ({ kind: 'linear' } & LinearGradientGeometry) | ({ kind: 'radial' } & RadialGradientGeometry)
export type PaintSize = { width: number; height: number }
export type PaintPoint = { x: number; y: number }
export const UNIT_PAINT_SIZE: PaintSize = { width: 1, height: 1 }

/** The editing view of a gradient paint's stored geometry, if it has one. */
export function gradientGeometry(paint: DesignGradientPaint): GradientGeometry | undefined {
  if (paint.type === 'GRADIENT_RADIAL') return paint.geometry ? { kind: 'radial', ...paint.geometry } : undefined
  return paint.geometry ? { kind: 'linear', ...paint.geometry } : undefined
}

/**
 * The paint with `geometry` stored. The geometry kind decides the paint type; a
 * linear paint with endpoints stores no CSS angle.
 */
export function withGradientGeometry(paint: DesignGradientPaint, geometry: GradientGeometry): DesignGradientPaint {
  const base = { gradientStops: paint.gradientStops, opacity: paint.opacity }
  if (geometry.kind === 'radial') {
    return { type: 'GRADIENT_RADIAL', ...base, geometry: { center: geometry.center, radiusScale: geometry.radiusScale } }
  }
  return { type: 'GRADIENT_LINEAR', ...base, geometry: { start: geometry.start, end: geometry.end } }
}

const pixel = (p: PaintPoint, size: PaintSize): PaintPoint => ({ x: p.x * size.width, y: p.y * size.height })
const relative = (p: PaintPoint, size: PaintSize): PaintPoint => ({ x: p.x / size.width, y: p.y / size.height })
export const gradientDistance = (a: PaintPoint, b: PaintPoint) => Math.hypot(b.x - a.x, b.y - a.y)

export function radialBaseRadius(center: PaintPoint, size: PaintSize): number {
  return Math.hypot(Math.max(Math.abs(center.x), Math.abs(1 - center.x)) * size.width,
    Math.max(Math.abs(center.y), Math.abs(1 - center.y)) * size.height)
}

/** CSS's default gradient line (through the centre, perpendicular corner projection). */
export function linearGeometryFromAngle(angle: number, size: PaintSize): Extract<GradientGeometry, { kind: 'linear' }> {
  const radians = angle * Math.PI / 180
  const dx = Math.sin(radians), dy = -Math.cos(radians)
  const length = Math.abs(size.width * dx) + Math.abs(size.height * dy)
  return { kind: 'linear',
    start: { x: 0.5 - dx * length / 2 / size.width, y: 0.5 - dy * length / 2 / size.height },
    end: { x: 0.5 + dx * length / 2 / size.width, y: 0.5 + dy * length / 2 / size.height } }
}

export function gradientAngle(geometry: Extract<GradientGeometry, { kind: 'linear' }>, size: PaintSize): number {
  return (Math.atan2((geometry.end.x - geometry.start.x) * size.width,
    -(geometry.end.y - geometry.start.y) * size.height) * 180 / Math.PI + 360) % 360
}

export function rotateLinearGradient(geometry: Extract<GradientGeometry, { kind: 'linear' }>, angle: number, size: PaintSize): GradientGeometry {
  const a = pixel(geometry.start, size), b = pixel(geometry.end, size)
  const radius = gradientDistance(a, b) / 2, radians = angle * Math.PI / 180
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
  return { kind: 'linear', start: relative({ x: cx - Math.sin(radians) * radius, y: cy + Math.cos(radians) * radius }, size),
    end: relative({ x: cx + Math.sin(radians) * radius, y: cy - Math.cos(radians) * radius }, size) }
}

/** Same parameter drives CSS stops and spatial contrast sampling. No stop rounding here. */
export function gradientParameterAt(geometry: GradientGeometry, point: PaintPoint, size: PaintSize): number {
  if (geometry.kind === 'radial') {
    return gradientDistance(pixel(point, size), pixel(geometry.center, size)) /
      (radialBaseRadius(geometry.center, size) * geometry.radiusScale)
  }
  const a = pixel(geometry.start, size), b = pixel(geometry.end, size), p = pixel(point, size)
  const dx = b.x - a.x, dy = b.y - a.y
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)
}

export type GradientHandle = 'start' | 'end' | 'line' | 'center' | 'radius'
export function moveGradientGeometry(geometry: GradientGeometry, handle: GradientHandle,
  delta: PaintPoint, size: PaintSize): GradientGeometry {
  const shift = (p: PaintPoint) => ({ x: p.x + delta.x, y: p.y + delta.y })
  if (geometry.kind === 'linear') {
    const next = { ...geometry,
      start: handle === 'start' || handle === 'line' ? shift(geometry.start) : geometry.start,
      end: handle === 'end' || handle === 'line' ? shift(geometry.end) : geometry.end }
    return gradientDistance(pixel(next.start, size), pixel(next.end, size)) < 0.01 ? geometry : next
  }
  const radius = radialBaseRadius(geometry.center, size) * geometry.radiusScale
  if (handle === 'center' || handle === 'line') {
    const center = shift(geometry.center)
    return { ...geometry, center, radiusScale: radius / radialBaseRadius(center, size) }
  }
  // Radial has no angle: the range handle is displayed below the centre.
  return { ...geometry, radiusScale: Math.max(0.01, Math.hypot(delta.x * size.width, radius + delta.y * size.height)) /
    radialBaseRadius(geometry.center, size) }
}

/** Translate an arbitrary endpoint line into the browser's centre-based CSS gradient line. */
export function linearCssCoordinates(geometry: Extract<GradientGeometry, { kind: 'linear' }>, size: PaintSize) {
  const angle = gradientAngle(geometry, size)
  const cssLine = linearGeometryFromAngle(angle, size)
  const start = gradientParameterAt(cssLine, geometry.start, size)
  const end = gradientParameterAt(cssLine, geometry.end, size)
  return { angle, start, length: end - start }
}
