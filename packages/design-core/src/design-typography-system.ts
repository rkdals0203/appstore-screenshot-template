import {
  documentTextStyle,
  documentTextStyles,
  withDocumentTextStyles,
  type DesignDocument,
  type DesignLayer,
  type DesignTextStyle,
  type DesignTextStyleRole,
  type TextLayer,
} from './design-document'

const STYLE_KEYS = [
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'fontSize',
  'lineHeight',
  'letterSpacing',
] as const

type StyleTypography = DesignTextStyle['typography']
type StyleTypographyPatch = Partial<StyleTypography>

export function textStyleRoleForLayer(layer: TextLayer): DesignTextStyleRole | null {
  switch (layer.extensions?.crescreendo?.role) {
    case 'heroHeadline': return 'headline'
    case 'subheadline': return 'subheadline'
    case 'kicker': return 'kicker'
    case 'callout': return 'body'
    default: return null
  }
}

export function findDesignTextStyle(
  document: Pick<DesignDocument, 'tokens'>,
  styleId: string | undefined,
): DesignTextStyle | null {
  if (!styleId) return null
  return documentTextStyle(document, styleId) ?? null
}

export function resolveTextStyleTypography(
  style: DesignTextStyle,
  overrides?: StyleTypographyPatch,
): StyleTypography {
  // An omitted style fontStyle means the normal face. Text layers parsed from
  // DesignDocument commonly materialize that same value as `normal`, so the
  // shared style must resolve it explicitly before comparison or attachment.
  return { fontStyle: 'normal', ...style.typography, ...overrides }
}

export function typographyMatchesStyle(
  layer: TextLayer,
  style: DesignTextStyle,
): boolean {
  const resolved = resolveTextStyleTypography(style, layer.styleOverrides)
  return STYLE_KEYS.every((key) => {
    const layerValue = key === 'fontStyle'
      ? layer.style.fontStyle ?? 'normal'
      : layer.style[key]
    return Object.is(layerValue, resolved[key])
  })
}

export function attachResolvedTextStyle(
  layer: TextLayer,
  style: DesignTextStyle,
  overrides?: StyleTypographyPatch,
): TextLayer {
  const nextOverrides = overrides && Object.keys(overrides).length > 0 ? overrides : undefined
  const nextLayer: TextLayer = {
    ...layer,
    textStyleId: style.id,
    style: {
      ...layer.style,
      ...resolveTextStyleTypography(style, nextOverrides),
    },
  }
  if (nextOverrides) nextLayer.styleOverrides = nextOverrides
  else delete nextLayer.styleOverrides
  return nextLayer
}

function mapTextLayers(
  layers: readonly DesignLayer[],
  update: (layer: TextLayer) => TextLayer,
): DesignLayer[] {
  return layers.map((layer) => {
    if (layer.type === 'TEXT') return update(layer)
    if (layer.type === 'GROUP') return { ...layer, children: mapTextLayers(layer.children, update) }
    return layer
  })
}

export function updateDesignTextStyle(
  document: DesignDocument,
  styleId: string,
  patch: StyleTypographyPatch,
): DesignDocument {
  const current = findDesignTextStyle(document, styleId)
  if (!current) return document
  const nextStyle: DesignTextStyle = {
    ...current,
    typography: { ...current.typography, ...patch },
  }
  return withDocumentTextStyles({
    ...document,
    frames: document.frames.map((slide) => ({
      ...slide,
      children: mapTextLayers(slide.children, (layer) => (
        layer.textStyleId === styleId ? attachResolvedTextStyle(layer, nextStyle, layer.styleOverrides) : layer
      )),
    })),
  }, documentTextStyles(document).map((style) => style.id === styleId ? nextStyle : style))
}

export function setTextLayerStyleOverride(
  document: DesignDocument,
  layerId: string,
  patch: StyleTypographyPatch,
): DesignDocument {
  const styles = new Map(documentTextStyles(document).map((style) => [style.id, style]))
  let changed = false
  const slides = document.frames.map((slide) => ({
    ...slide,
    children: mapTextLayers(slide.children, (layer) => {
      if (layer.id !== layerId || !layer.textStyleId) return layer
      const style = styles.get(layer.textStyleId)
      if (!style) return layer
      changed = true
      return attachResolvedTextStyle(layer, style, { ...layer.styleOverrides, ...patch })
    }),
  }))
  return changed ? { ...document, frames: slides } : document
}

export function resetTextLayerStyleOverrides(
  document: DesignDocument,
  layerId: string,
): DesignDocument {
  const styles = new Map(documentTextStyles(document).map((style) => [style.id, style]))
  let changed = false
  const slides = document.frames.map((slide) => ({
    ...slide,
    children: mapTextLayers(slide.children, (layer) => {
      if (layer.id !== layerId || !layer.textStyleId) return layer
      const style = styles.get(layer.textStyleId)
      if (!style) return layer
      changed = true
      return attachResolvedTextStyle(layer, style)
    }),
  }))
  return changed ? { ...document, frames: slides } : document
}

export function detachTextLayerStyle(document: DesignDocument, layerId: string): DesignDocument {
  let changed = false
  const slides = document.frames.map((slide) => ({
    ...slide,
    children: mapTextLayers(slide.children, (layer) => {
      if (layer.id !== layerId || !layer.textStyleId) return layer
      changed = true
      const { textStyleId: _styleId, styleOverrides: _overrides, ...rest } = layer
      return rest as TextLayer
    }),
  }))
  return changed ? { ...document, frames: slides } : document
}
