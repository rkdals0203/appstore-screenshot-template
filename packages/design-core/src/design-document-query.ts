import type { DesignDocument, DesignLayer, DesignSlide } from './design-document'

export interface DesignLayerLookupResult {
  slide: DesignSlide
  layer: DesignLayer
  offsetX: number
  offsetY: number
}

export function collectDesignLayerIds(
  layers: readonly DesignLayer[],
  out = new Set<string>(),
): Set<string> {
  for (const layer of layers) {
    out.add(layer.id)
    if (layer.type === 'GROUP') collectDesignLayerIds(layer.children, out)
  }
  return out
}

function findDesignLayerInLayers(
  layers: readonly DesignLayer[],
  layerId: string,
  offsetX: number,
  offsetY: number,
): Omit<DesignLayerLookupResult, 'slide'> | null {
  for (const layer of layers) {
    if (layer.id === layerId) return { layer, offsetX, offsetY }
    if (layer.type !== 'GROUP') continue
    const child = findDesignLayerInLayers(
      layer.children,
      layerId,
      offsetX + layer.frame.x,
      offsetY + layer.frame.y,
    )
    if (child) return child
  }
  return null
}

export function findDesignLayer(
  document: DesignDocument | undefined,
  layerId: string,
): DesignLayerLookupResult | null {
  if (!document) return null
  for (const slide of document.frames) {
    const result = findDesignLayerInLayers(slide.children, layerId, 0, 0)
    if (result) return { ...result, slide }
  }
  return null
}

export function findDesignLayerById(
  document: DesignDocument | undefined,
  layerId: string,
): DesignLayer | null {
  return findDesignLayer(document, layerId)?.layer ?? null
}
