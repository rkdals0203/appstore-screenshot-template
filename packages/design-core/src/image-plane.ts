import type { ImageLayer } from './design-document'
import {
  type DesignTransform2D, mapDesignPoint, mapDesignFrameBounds, invertDesignTransform,
  multiplyDesignTransforms, rotateDesignTransform, translateDesignTransform,
} from './design-transform'

/** Same X/Y signs as the orthographic mockup screen; ordinary Z is an outer 2D rotation.
 * No image bytes, model dimensions or browser state participate in the pose. */
export function imagePlaneLinearTransform(layer: Pick<ImageLayer, 'rotation' | 'tilt'>): DesignTransform2D {
  const rx = (layer.tilt?.rotationX ?? 0) * Math.PI / 180
  const ry = (layer.tilt?.rotationY ?? 0) * Math.PI / 180
  const tilt = { a: Math.cos(ry), b: Math.sin(rx) * Math.sin(ry),
    c: 0, d: Math.cos(rx), e: 0, f: 0 }
  return multiplyDesignTransforms(rotateDesignTransform(layer.rotation), tilt)
}

export function hasImageTilt(layer: { type: string; tilt?: ImageLayer['tilt'] }): boolean {
  return layer.type === 'IMAGE' && !!layer.tilt && (layer.tilt.rotationX !== 0 || layer.tilt.rotationY !== 0)
}

export function resolveImagePlane(layer: Pick<ImageLayer, 'frame' | 'rotation' | 'tilt'>) {
  const { x, y, width, height } = layer.frame
  const linear = imagePlaneLinearTransform(layer)
  const transform = multiplyDesignTransforms(translateDesignTransform(x + width / 2, y + height / 2),
    multiplyDesignTransforms(linear, translateDesignTransform(-width / 2, -height / 2)))
  const corners = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
    .map(point => mapDesignPoint(transform, point))
  return { linear, transform, inverse: invertDesignTransform(transform), corners,
    bounds: mapDesignFrameBounds(transform, layer.frame) }
}
