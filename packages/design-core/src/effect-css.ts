import type { DesignEffect } from './design-document'

export interface DesignEffectsCss {
  boxShadow?: string
  filter?: string
  backdropFilter?: string
}

/**
 * Pure DesignEffect → CSS mapping shared by the renderer and exporters.
 *
 * `box` shadows become `box-shadow` on the layer frame. `ink` shadows become
 * `drop-shadow()` filters ahead of layer blurs, so they follow the rendered
 * silhouette; `drop-shadow()` has no spread, so spread widens the blur.
 */
export function designEffectsToCss(effects: readonly DesignEffect[]): DesignEffectsCss {
  const css: DesignEffectsCss = {}
  const filters: string[] = []
  const shadows: string[] = []
  const inkShadows: string[] = []

  for (const effect of effects) {
    if (effect.type === 'DROP_SHADOW') {
      const { x, y } = effect.offset
      if (effect.render === 'ink') {
        inkShadows.push(`drop-shadow(${x}px ${y}px ${Math.max(0, effect.radius + effect.spread)}px ${effect.color})`)
      } else {
        shadows.push(`${x}px ${y}px ${effect.radius}px ${effect.spread}px ${effect.color}`)
      }
    } else if (effect.type === 'LAYER_BLUR') {
      filters.push(`blur(${effect.radius}px)`)
    } else {
      css.backdropFilter = `blur(${effect.radius}px)`
    }
  }

  if (shadows.length) css.boxShadow = shadows.join(', ')
  if (inkShadows.length || filters.length) css.filter = [...inkShadows, ...filters].join(' ')
  return css
}
