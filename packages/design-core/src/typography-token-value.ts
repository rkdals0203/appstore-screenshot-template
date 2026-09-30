import { z } from 'zod/v4'

/**
 * The W3C Design Tokens (DTCG 2025.10) value of a text style: what CSS draws for
 * the style's own typography at its own font size. Documents keep the exact CSS
 * values (layers attach them and compare them exactly); this is the standard
 * projection that token tools read.
 *
 * DTCG has no font-size-relative units, so `em` and `%` letter spacing become px
 * at the style's size, and line heights become multipliers. CSS `normal` line
 * height depends on the font, so it projects to 1.2. Values CSS would reject fall
 * back to the CSS initial value (weight 400, letter spacing 0).
 */
export const dtcgDimensionSchema = z.object({
  value: z.number().finite(),
  unit: z.enum(['px', 'rem']),
}).strict()

export const dtcgTypographyValueSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: dtcgDimensionSchema,
  fontWeight: z.number().min(1).max(1000),
  letterSpacing: dtcgDimensionSchema,
  lineHeight: z.number().finite(),
}).strict()

export type DtcgDimension = z.infer<typeof dtcgDimensionSchema>
export type DtcgTypographyValue = z.infer<typeof dtcgTypographyValueSchema>

/** CSS root font size for `rem`. */
const ROOT_FONT_SIZE = 16
const NORMAL_LINE_HEIGHT = 1.2
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|em|rem|%)$/i

/** Six decimals: stable JSON for products like 0.02 × 96. */
const round = (value: number) => Math.round(value * 1e6) / 1e6

function fontWeight(value: string | number): number {
  const weight = typeof value === 'number' ? value
    : NUMBER.test(value.trim()) ? Number(value.trim())
    : ({ normal: 400, bold: 700, bolder: 700, lighter: 100 } as Record<string, number>)[value.trim().toLowerCase()] ?? 400
  return Number.isFinite(weight) && weight >= 1 && weight <= 1000 ? weight : 400
}

function lineHeight(value: string | number, fontSize: number): number {
  if (typeof value === 'number') return value >= 0 ? value : NORMAL_LINE_HEIGHT
  const text = value.trim()
  if (NUMBER.test(text)) return Number(text) >= 0 ? Number(text) : NORMAL_LINE_HEIGHT
  const length = LENGTH.exec(text)
  if (!length || Number(length[1]) < 0) return NORMAL_LINE_HEIGHT
  const amount = Number(length[1])
  switch (length[2]!.toLowerCase()) {
    case '%': return round(amount / 100)
    case 'em': return amount
    case 'rem': return round(amount * ROOT_FONT_SIZE / fontSize)
    default: return round(amount / fontSize)
  }
}

function letterSpacing(value: string | number, fontSize: number): DtcgDimension {
  if (typeof value === 'number') return { value, unit: 'px' }
  const length = LENGTH.exec(value.trim())
  if (!length) return { value: 0, unit: 'px' }
  const amount = Number(length[1])
  switch (length[2]!.toLowerCase()) {
    case '%': return { value: round(amount / 100 * fontSize), unit: 'px' }
    case 'em': return { value: round(amount * fontSize), unit: 'px' }
    case 'rem': return { value: amount, unit: 'rem' }
    default: return { value: amount, unit: 'px' }
  }
}

export function dtcgTypographyValue(typography: {
  fontFamily: string
  fontWeight: string | number
  fontSize: number
  lineHeight: string | number
  letterSpacing: string | number
}): DtcgTypographyValue {
  return {
    fontFamily: typography.fontFamily,
    fontSize: { value: typography.fontSize, unit: 'px' },
    fontWeight: fontWeight(typography.fontWeight),
    letterSpacing: letterSpacing(typography.letterSpacing, typography.fontSize),
    lineHeight: lineHeight(typography.lineHeight, typography.fontSize),
  }
}
