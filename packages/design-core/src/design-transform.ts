import type { DesignFrame, DesignLayer } from './design-document'

export interface DesignPoint {
  x: number
  y: number
}

/** CSS 2D matrix(a, b, c, d, e, f). The right-most transform is applied first. */
export interface DesignTransform2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_DESIGN_TRANSFORM: DesignTransform2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
}

export function multiplyDesignTransforms(
  left: DesignTransform2D,
  right: DesignTransform2D,
): DesignTransform2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

export function translateDesignTransform(x: number, y: number): DesignTransform2D {
  return { ...IDENTITY_DESIGN_TRANSFORM, e: x, f: y }
}

export function rotateDesignTransform(degrees: number): DesignTransform2D {
  const radians = degrees * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 }
}

export function scaleDesignTransform(scale: number): DesignTransform2D {
  return { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }
}

export function aroundDesignPoint(
  transform: DesignTransform2D,
  origin: DesignPoint,
): DesignTransform2D {
  return multiplyDesignTransforms(
    translateDesignTransform(origin.x, origin.y),
    multiplyDesignTransforms(transform, translateDesignTransform(-origin.x, -origin.y)),
  )
}

export function invertDesignTransform(transform: DesignTransform2D): DesignTransform2D {
  const determinant = transform.a * transform.d - transform.b * transform.c
  if (Math.abs(determinant) < 1e-12) {
    throw new Error('Cannot invert a singular design transform')
  }
  return {
    a: transform.d / determinant,
    b: -transform.b / determinant,
    c: -transform.c / determinant,
    d: transform.a / determinant,
    e: (transform.c * transform.f - transform.d * transform.e) / determinant,
    f: (transform.b * transform.e - transform.a * transform.f) / determinant,
  }
}

export function mapDesignPoint(
  transform: DesignTransform2D,
  point: DesignPoint,
): DesignPoint {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f,
  }
}

export function mapDesignVector(
  transform: DesignTransform2D,
  vector: DesignPoint,
): DesignPoint {
  return {
    x: transform.a * vector.x + transform.c * vector.y,
    y: transform.b * vector.x + transform.d * vector.y,
  }
}

export function mapDesignFrameBounds(
  transform: DesignTransform2D,
  frame: Pick<DesignFrame, 'width' | 'height'>,
): DesignFrame {
  const points = [
    mapDesignPoint(transform, { x: 0, y: 0 }),
    mapDesignPoint(transform, { x: frame.width, y: 0 }),
    mapDesignPoint(transform, { x: frame.width, y: frame.height }),
    mapDesignPoint(transform, { x: 0, y: frame.height }),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  }
}

/** Matches `position: absolute` plus CSS `transform-origin: center; rotate(...)`. */
export function designLayerLocalToParent(
  layer: Pick<DesignLayer, 'frame' | 'rotation'>,
): DesignTransform2D {
  const { x, y, width, height } = layer.frame
  const center = { x: x + width / 2, y: y + height / 2 }
  return multiplyDesignTransforms(
    translateDesignTransform(center.x, center.y),
    multiplyDesignTransforms(
      rotateDesignTransform(layer.rotation),
      translateDesignTransform(-width / 2, -height / 2),
    ),
  )
}

export function designTransformRotation(transform: DesignTransform2D): number {
  return Math.atan2(transform.b, transform.a) * 180 / Math.PI
}

export function frameFromRigidDesignTransform(
  transform: DesignTransform2D,
  width: number,
  height: number,
): { frame: DesignFrame; rotation: number } {
  const center = mapDesignPoint(transform, { x: width / 2, y: height / 2 })
  return {
    frame: {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    },
    rotation: designTransformRotation(transform),
  }
}
