export type FontWeightMatchStrategy = 'exact' | 'css-fallback'

export interface FontWeightResolution {
  requestedWeight: number
  renderedWeight: number
  matchStrategy: FontWeightMatchStrategy
}

function normalizedWeights(availableWeights: readonly number[]): number[] {
  return Array.from(new Set(availableWeights
    .map((weight) => Math.round(weight))
    .filter((weight) => Number.isFinite(weight) && weight >= 1 && weight <= 1_000)))
    .toSorted((left, right) => left - right)
}

/**
 * Resolve a missing static font face with the CSS Fonts Level 4 search order.
 * This is intentionally shared by server-side contracts and browser readiness
 * so a generated document records the same face that the renderer will select.
 */
export function resolveAvailableFontWeight(
  requestedWeight: number,
  availableWeights: readonly number[],
): FontWeightResolution | null {
  const requested = Math.min(1_000, Math.max(1, Math.round(requestedWeight)))
  const available = normalizedWeights(availableWeights)
  if (available.length === 0) return null
  if (available.includes(requested)) {
    return { requestedWeight: requested, renderedWeight: requested, matchStrategy: 'exact' }
  }

  let candidates: number[]
  if (requested >= 400 && requested <= 500) {
    candidates = [
      ...available.filter((weight) => weight >= requested && weight <= 500),
      ...available.filter((weight) => weight < requested).toSorted((left, right) => right - left),
      ...available.filter((weight) => weight > 500),
    ]
  } else if (requested < 400) {
    candidates = [
      ...available.filter((weight) => weight <= requested).toSorted((left, right) => right - left),
      ...available.filter((weight) => weight > requested),
    ]
  } else {
    candidates = [
      ...available.filter((weight) => weight >= requested),
      ...available.filter((weight) => weight < requested).toSorted((left, right) => right - left),
    ]
  }

  const renderedWeight = candidates[0]
  return renderedWeight == null
    ? null
    : { requestedWeight: requested, renderedWeight, matchStrategy: 'css-fallback' }
}
