import { z } from 'zod/v4'

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

export const deckColorTokenRoleValues = [
  'canvasBackground',
  'surface',
  'primaryInk',
  'secondaryInk',
  'brandAccent',
  'supportAccent',
  'outline',
  'graphicTint',
] as const

/** Name of a color token inside the document's DTCG `color` group, e.g. `brand-accent`. */
export const colorTokenNameSchema = z.string().regex(/^[a-z][a-z-]*$/)
/**
 * Figma-style variable name of a color token, e.g. `color/brand-accent`. Contracts
 * outside the document (color systems, template manifests, model contracts) use it.
 */
export const colorTokenIdSchema = z.templateLiteral(['color/', colorTokenNameSchema])
/** DTCG alias a document paint uses for a color token, e.g. `{color.brand-accent}`. */
export const colorTokenAliasSchema = z.templateLiteral(['{color.', colorTokenNameSchema, '}'])

export type ColorTokenId = z.infer<typeof colorTokenIdSchema>
export type ColorTokenAlias = z.infer<typeof colorTokenAliasSchema>

/** A color token as color systems and template contracts pass it around. */
export const deckColorTokenSchema = z.object({
  id: colorTokenIdSchema,
  role: z.enum(deckColorTokenRoleValues),
  hex: hexColorSchema,
  source: z.enum(['target', 'reference', 'derived', 'neutral', 'user']),
  sourceEvidenceId: z.string().max(160).nullable().default(null),
  tone: z.number().min(0).max(100),
  chroma: z.number().min(0),
}).strict()

export type DeckColorToken = z.infer<typeof deckColorTokenSchema>
/** A deck color token before validation (`designColorTokenGroup` parses it); `sourceEvidenceId` may be omitted. */
export type DeckColorTokenInput = {
  id: string
  role: string
  hex: string
  source: string
  sourceEvidenceId?: string | null
  tone: number
  chroma: number
}

const unitComponentSchema = z.number().min(0).max(1)
const hexChannel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)

/**
 * A document color token in the W3C Design Tokens format (DTCG 2025.10): an opaque
 * sRGB color whose components are its hex fallback's channels. Crescreendo's
 * palette facts (role, source, tone, chroma) live in `$extensions.crescreendo`.
 */
export const designColorTokenSchema = z.object({
  $type: z.literal('color'),
  $value: z.object({
    colorSpace: z.literal('srgb'),
    components: z.tuple([unitComponentSchema, unitComponentSchema, unitComponentSchema]),
    hex: hexColorSchema,
  }).strict().refine(
    ({ components, hex }) => components.every((component, index) => Math.round(component * 255) === hexChannel(hex, index)),
    'Color components must be the hex value\'s channels.',
  ),
  $extensions: z.object({
    crescreendo: deckColorTokenSchema.omit({ id: true, hex: true }),
  }).strict(),
}).strict()

/** The document's DTCG `color` group, keyed by token name in deck order. */
export const designColorTokenGroupSchema = z.record(colorTokenNameSchema, designColorTokenSchema)
  .refine((group) => Object.keys(group).length <= 32, 'A deck has at most 32 color tokens.')

export type DesignColorToken = z.infer<typeof designColorTokenSchema>
export type DesignColorTokenGroup = z.infer<typeof designColorTokenGroupSchema>

export function isColorTokenAlias(value: unknown): value is ColorTokenAlias {
  return colorTokenAliasSchema.safeParse(value).success
}

export function colorTokenAlias(id: ColorTokenId): ColorTokenAlias {
  return `{color.${id.slice('color/'.length)}}`
}

export function colorTokenIdFromAlias(alias: ColorTokenAlias): ColorTokenId {
  return `color/${alias.slice('{color.'.length, -1)}`
}

/** A deck color token as a DTCG color token. */
export function designColorToken(token: DeckColorToken): DesignColorToken {
  const { hex, role, source, sourceEvidenceId, tone, chroma } = token
  return {
    $type: 'color',
    $value: { colorSpace: 'srgb', components: [hexChannel(hex, 0) / 255, hexChannel(hex, 1) / 255, hexChannel(hex, 2) / 255], hex },
    $extensions: { crescreendo: { role, source, sourceEvidenceId, tone, chroma } },
  }
}

/** A DTCG color token of the document, named `name`, as a deck color token. */
export function deckColorToken(name: string, token: DesignColorToken): DeckColorToken {
  const { role, source, sourceEvidenceId, tone, chroma } = token.$extensions.crescreendo
  return { id: `color/${name}`, role, hex: token.$value.hex, source, sourceEvidenceId, tone, chroma }
}

/** The DTCG `color` group holding `tokens`, in their order. */
export function designColorTokenGroup(tokens: readonly DeckColorTokenInput[]): DesignColorTokenGroup {
  return Object.fromEntries(tokens.map((input) => {
    const token = deckColorTokenSchema.parse(input)
    return [token.id.slice('color/'.length), designColorToken(token)]
  }))
}
