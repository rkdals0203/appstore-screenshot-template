import type { TextLayer } from './design-document'

const NON_LATIN_GLYPH = /[^\u0000-\u00ff]/
const WHITESPACE_GLYPH = /\s/
const NARROW_LATIN_GLYPH = /[ilI1'`.,:;!|]/
const MEDIUM_NARROW_LATIN_GLYPH = /[jtfr]/
const WIDE_LATIN_GLYPH = /[mwMW@%&]/
const UPPERCASE_LATIN_GLYPH = /[A-Z]/
const DIGIT_GLYPH = /[0-9]/
const PUNCTUATION_GLYPH = /[-_()[\]{}+\/=\\]/

export const DEFAULT_VISUAL_TEXT_WIDTH_RATIO = 0.92
export const PIXEL_SAFE_TEXT_WIDTH_RATIO = 0.86
export const PIXEL_SAFE_TEXT_HEIGHT_RATIO = 0.96
export const VISUAL_TEXT_SAFE_MARGIN_RATIO = 0.045
// Range.getClientRects() follows glyph ink, which can extend beyond the CSS line box by roughly
// 0.2em for punctuation and accented Latin glyphs. Scroll overflow and observed line count remain
// independent blockers, so this tolerance removes font-metric false positives without hiding wrap.
export const VISUAL_TEXT_GLYPH_OVERHANG_RATIO = 0.2

export interface VisualTextLayoutOptions {
  widthSafety?: number
  longWordBehavior?: 'wrap' | 'preserve'
}

function letterSpacingPixels(value: string | number | undefined, fontSize: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 0
  const normalized = value.trim().toLowerCase()
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return 0
  if (normalized.endsWith('rem')) return parsed * 16
  if (normalized.endsWith('em')) return parsed * fontSize
  if (normalized.endsWith('%')) return (parsed / 100) * fontSize
  return parsed
}

function lineHeightMultiplier(value: string | number | undefined, fontSize: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 1.2
  const normalized = value.trim().toLowerCase()
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return 1.2
  if (normalized.endsWith('%')) return parsed / 100
  if (normalized.endsWith('px')) return parsed / fontSize
  return parsed > 4 ? parsed / fontSize : parsed
}

function glyphWidthEm(character: string): number {
  if (WHITESPACE_GLYPH.test(character)) return 0.28
  if (NON_LATIN_GLYPH.test(character)) return 1
  if (NARROW_LATIN_GLYPH.test(character)) return 0.28
  if (MEDIUM_NARROW_LATIN_GLYPH.test(character)) return 0.38
  if (WIDE_LATIN_GLYPH.test(character)) return 0.84
  if (UPPERCASE_LATIN_GLYPH.test(character)) return 0.64
  if (DIGIT_GLYPH.test(character)) return 0.55
  if (PUNCTUATION_GLYPH.test(character)) return 0.4
  return 0.54
}

function textWidthPixels(value: string, fontSize: number, letterSpacing: number): number {
  const characters = [...value]
  const glyphWidth = characters.reduce((total, character) => total + glyphWidthEm(character), 0) * fontSize
  return glyphWidth + Math.max(0, characters.length - 1) * letterSpacing
}

export function hasForcedVisualWordBreak(
  layer: TextLayer,
  options: VisualTextLayoutOptions = {},
): boolean {
  const fontSize = Math.max(1, layer.style.fontSize ?? 16)
  const letterSpacing = letterSpacingPixels(layer.style.letterSpacing, fontSize)
  const widthSafety = Math.min(1, Math.max(0.5, options.widthSafety ?? DEFAULT_VISUAL_TEXT_WIDTH_RATIO))
  const maxLineWidth = Math.max(1, layer.frame.width * widthSafety)
  return layer.characters
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => textWidthPixels(word, fontSize, letterSpacing) > maxLineWidth)
}

/**
 * Family-agnostic approximation used before browser pixel observation.
 * It is deliberately shared by planning, repair, and document audit so one
 * document cannot pass one deterministic stage and fail another heuristic.
 */
export function estimateVisualTextLines(
  layer: TextLayer,
  options: VisualTextLayoutOptions = {},
): number {
  const explicitLines = layer.characters.split(/\r?\n/)
  const fontSize = Math.max(1, layer.style.fontSize ?? 16)
  const letterSpacing = letterSpacingPixels(layer.style.letterSpacing, fontSize)
  const widthSafety = Math.min(1, Math.max(0.5, options.widthSafety ?? DEFAULT_VISUAL_TEXT_WIDTH_RATIO))
  const maxLineWidth = Math.max(1, layer.frame.width * widthSafety)
  const textWidth = (value: string): number => textWidthPixels(value, fontSize, letterSpacing)
  const spaceWidth = textWidth(' ')
  let count = 0

  for (const explicitLine of explicitLines) {
    const words = explicitLine.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      count += 1
      continue
    }
    let currentWidth = 0
    let lineCount = 1
    for (const word of words) {
      const wordWidth = textWidth(word)

      // Text layers render with overflow-wrap:anywhere. A word wider than the
      // available line therefore occupies multiple visual lines even when it
      // has no whitespace. Counting it as one line made planning under-size
      // frames that the browser later wrapped (for example "presentation").
      if (wordWidth > maxLineWidth) {
        if (currentWidth > 0) {
          lineCount += 1
          currentWidth = 0
        }
        if (options.longWordBehavior === 'preserve') {
          currentWidth = wordWidth
          continue
        }
        const fragments = Math.max(1, Math.ceil(wordWidth / maxLineWidth))
        lineCount += fragments - 1
        currentWidth = wordWidth - ((fragments - 1) * maxLineWidth)
        continue
      }

      const nextWidth = currentWidth === 0 ? wordWidth : currentWidth + spaceWidth + wordWidth
      if (currentWidth > 0 && nextWidth > maxLineWidth) {
        lineCount += 1
        currentWidth = wordWidth
      } else {
        currentWidth = nextWidth
      }
    }
    count += lineCount
  }

  return Math.max(1, count)
}

export function estimateVisualTextHeight(
  layer: TextLayer,
  options: VisualTextLayoutOptions = {},
): number {
  const fontSize = Math.max(1, layer.style.fontSize ?? 16)
  const lineHeight = Math.max(0.1, lineHeightMultiplier(layer.style.lineHeight, fontSize))
  return estimateVisualTextLines(layer, options) * fontSize * lineHeight
}
