import { z } from 'zod/v4'
import {
  designLayerMetadataSchema,
  type DesignLayerMetadata,
} from './metadata'
import { dtcgTypographyValue, dtcgTypographyValueSchema } from './typography-token-value'
import { colorTokenAliasSchema, colorTokenIdFromAlias, deckColorToken, designColorTokenGroup, designColorTokenGroupSchema, type ColorTokenAlias, type ColorTokenId, type DeckColorToken, type DeckColorTokenInput } from './color-tokens'
import { resolutionAdaptationSchema } from './resolution-adaptation-schema'

export const designDocumentSchemaVersion = 2 as const

export const designLayerTypeValues = [
  'TEXT',
  'IMAGE',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'VECTOR',
  'MOCKUP',
  'GROUP',
] as const

export const designShapeLayerTypeValues = ['RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON'] as const

export const designImageAssetKindValues = [
  'screenshot',
  'screenshotDuplicate',
  'photo',
  'illustration',
  'generated',
  'brand',
  'appIcon',
  'storeBadge',
  'texture',
  'uploaded',
  'reference',
  'unknown',
] as const

/** Figma `scaleMode`: FILL = CSS object-fit cover, FIT = contain, STRETCH = fill. */
export const imageScaleModeValues = ['FILL', 'FIT', 'STRETCH'] as const
export type ImageScaleMode = (typeof imageScaleModeValues)[number]

const MAX_ASSET_REF_LENGTH = 2_000_000

export const designProvenanceSchema = z.object({
  createdBy: z.enum(['ai', 'user', 'import', 'converter']),
  sourceKind: z.enum(['generation', 'reference', 'uploaded', 'assetManifest']).optional(),
  sourceId: z.string().max(160).optional(),
  operation: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  promptId: z.string().max(120).optional(),
}).strict()

export const designFrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
}).strict()

export type DesignFrame = z.infer<typeof designFrameSchema>

export const designGradientStopSchema = z.object({
  position: z.number().min(0).max(1),
  color: z.string(),
  /** The document color token this stop's color comes from. */
  token: colorTokenAliasSchema.optional(),
}).strict()

const gradientPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const paintOpacitySchema = z.number().min(0).max(1).default(1)

/**
 * One paint, in Figma's `Paint` vocabulary. "No paint" is not a paint value: it is
 * an empty paint list (`fills: []`), as in Figma.
 *
 * Gradient geometry is relative to the painted box. A linear gradient without
 * geometry follows its CSS `angle` (the browser's gradient line through the
 * centre); with geometry the endpoints decide, so it stores no angle. A radial
 * gradient without geometry is a centred farthest-corner circle.
 */
export const designPaintSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SOLID'),
    color: z.string(),
    opacity: paintOpacitySchema,
    /** The document color token this color comes from. */
    token: colorTokenAliasSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('GRADIENT_LINEAR'),
    gradientStops: z.array(designGradientStopSchema).min(1),
    angle: z.number().optional(),
    geometry: z.object({ start: gradientPointSchema, end: gradientPointSchema }).strict()
      .refine(({ start, end }) => start.x !== end.x || start.y !== end.y, 'Gradient endpoints must differ')
      .optional(),
    opacity: paintOpacitySchema,
  }).strict().refine((paint) => paint.angle === undefined || paint.geometry === undefined, 'Use either angle or geometry, not both.'),
  z.object({
    type: z.literal('GRADIENT_RADIAL'),
    gradientStops: z.array(designGradientStopSchema).min(1),
    geometry: z.object({
      center: gradientPointSchema,
      /** Multiplier of circle farthest-corner; stays circular on non-square boxes. */
      radiusScale: z.number().finite().positive(),
    }).strict().optional(),
    opacity: paintOpacitySchema,
  }).strict(),
  z.object({
    type: z.literal('IMAGE'),
    assetRef: z.string().max(MAX_ASSET_REF_LENGTH),
    scaleMode: z.enum(imageScaleModeValues).default('FILL'),
    /** Focus point in percent of the box. */
    position: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict().default({ x: 50, y: 50 }),
    opacity: paintOpacitySchema,
  }).strict(),
])

/** Paint list, bottom to top. The renderer draws a single paint, so lists hold at most one. */
export const designPaintListSchema = z.array(designPaintSchema).max(1)

/**
 * A drop shadow states where it is painted. `box` casts from the layer frame
 * (CSS `box-shadow`, spread grows the box). `ink` follows the rendered
 * silhouette of glyphs, paths, image pixels or a device (CSS `drop-shadow`,
 * which has no spread: spread widens the blur instead).
 */
export const designDropShadowEffectSchema = z.object({
  type: z.literal('DROP_SHADOW'),
  offset: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  radius: z.number().finite().min(0),
  spread: z.number().finite().default(0),
  color: z.string().min(1).max(120),
  render: z.enum(['box', 'ink']),
}).strict()

export const designLayerBlurEffectSchema = z.object({
  type: z.literal('LAYER_BLUR'),
  radius: z.number().finite().min(0),
}).strict()

export const designBackgroundBlurEffectSchema = z.object({
  type: z.literal('BACKGROUND_BLUR'),
  radius: z.number().finite().min(0),
}).strict()

/** Layer effects (Figma `Effect` names), painted in list order. */
export const designEffectSchema = z.discriminatedUnion('type', [
  designDropShadowEffectSchema,
  designLayerBlurEffectSchema,
  designBackgroundBlurEffectSchema,
])

export const designEffectListSchema = z.array(designEffectSchema).max(16)

/**
 * Where a drop shadow is painted when its writer does not say: text and vector
 * outlines cast `ink`, every other layer casts from its `box`.
 */
export function defaultDropShadowRender(type: DesignLayerType): DesignDropShadowEffect['render'] {
  return type === 'TEXT' || type === 'VECTOR' ? 'ink' : 'box'
}

export const designTypographySchema = z.object({
  fontFamily: z.string().optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  fontSize: z.number().positive().optional(),
  lineHeight: z.union([z.string(), z.number()]).optional(),
  letterSpacing: z.union([z.string(), z.number()]).optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Explicit paragraph base direction for locale variants; absent legacy text keeps browser auto-detection. */
  paragraphDirection: z.enum(['ltr', 'rtl']).optional(),
  /**
   * 박스 **안에서** 글줄 뭉치를 세로로 어디에 둘지 (피그마의 Alignment 세로 3버튼).
   * 미지정 = 'top' — 기존 문서·AI 경로의 동작이 그대로다.
   * `textAutoResize: 'NONE'` 처럼 박스가 내용보다 클 때만 의미가 있다.
   */
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
}).strict()

export const designTextStyleRoleValues = [
  'headline',
  'subheadline',
  'kicker',
  'body',
  'caption',
] as const

export const designTextStyleTypographySchema = designTypographySchema.pick({
  fontFamily: true,
  fontWeight: true,
  fontSize: true,
  lineHeight: true,
  letterSpacing: true,
}).required().extend({
  fontStyle: designTypographySchema.shape.fontStyle,
})

/** A deck text style as generation contracts pass it around; documents store it as a typography token. */
export const designTextStyleSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  role: z.enum(designTextStyleRoleValues),
  variant: z.string().min(1).max(80).default('default'),
  typography: designTextStyleTypographySchema,
  source: z.enum(['freeform', 'reference', 'user']).default('freeform'),
}).strict()

/** DTCG token names cannot start with `$` or hold the alias syntax characters `{`, `}` and `.`. */
export const typographyTokenNameSchema = z.string().min(1).max(400).regex(/^(?!\$)[^{}.]+$/)

const TOKEN_NAME_ESCAPES: Readonly<Record<string, string>> = { '%': '%25', '.': '%2E', '{': '%7B', '}': '%7D', $: '%24' }

/**
 * The DTCG token name of a text style id. Generated ids can hold `.` (e.g. a
 * scale in `composition/headline/1.25-180.180`), so the reserved characters are
 * escaped losslessly; `textStyleIdFromTokenName` reverses it.
 */
export function typographyTokenName(id: string): string {
  return id.replace(/[%.{}]|^\$/g, (character) => TOKEN_NAME_ESCAPES[character]!)
}

export function textStyleIdFromTokenName(name: string): string {
  return name.replace(/%(25|2E|7B|7D|24)/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
}

const sameTypographyValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/**
 * A document text style in the W3C Design Tokens format (DTCG 2025.10). The exact
 * CSS typography layers attach and compare lives in `$extensions.crescreendo.style`;
 * `$value` is its standard projection at the style's own size (`dtcgTypographyValue`).
 */
export const designTypographyTokenSchema = z.object({
  $type: z.literal('typography'),
  $value: dtcgTypographyValueSchema,
  $extensions: z.object({
    crescreendo: z.object({
      name: designTextStyleSchema.shape.name,
      role: designTextStyleSchema.shape.role,
      variant: designTextStyleSchema.shape.variant,
      source: designTextStyleSchema.shape.source,
      style: designTextStyleTypographySchema,
    }).strict(),
  }).strict(),
}).strict().refine(
  (token) => sameTypographyValue(token.$value, dtcgTypographyValue(token.$extensions.crescreendo.style)),
  'The DTCG value must be the projection of the style\'s own typography.',
)

/** The document's DTCG `typography` group, keyed by text style (`typographyTokenName`) in deck order. */
export const designTypographyTokenGroupSchema = z.record(typographyTokenNameSchema, designTypographyTokenSchema)

export const designRichTextRunSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  /** Exact immutable source rich-text run used to authorize a localized emphasis style. */
  localizationSourceRunIndex: z.number().int().min(0).max(1_000).optional(),
  style: designTypographySchema.partial().optional(),
  /** Omitted: the run keeps the layer's fills. */
  fills: designPaintListSchema.optional(),
}).strict()

/**
 * Crescreendo-only data on a standard layer: the template contract (role,
 * binding, replacement policy, constraints, edit scope) and cross-slide
 * projection. Standard tools can ignore `extensions`.
 */
export const designLayerExtensionsSchema = z.object({
  crescreendo: designLayerMetadataSchema.nullish(),
}).strict()

export const designLayerBaseSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().max(120).optional(),
  frame: designFrameSchema,
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  extensions: designLayerExtensionsSchema.optional(),
  provenance: designProvenanceSchema.optional(),
}).strict()

export type DesignLayerBase = z.infer<typeof designLayerBaseSchema>

export type DesignLayer = z.infer<typeof designLayerSchema>

export const textAutoResizeValues = ['WIDTH_AND_HEIGHT', 'HEIGHT', 'NONE'] as const
export type TextAutoResize = (typeof textAutoResizeValues)[number]
export const leadingTrimValues = ['NONE', 'CAP_HEIGHT'] as const
export type LeadingTrim = (typeof leadingTrimValues)[number]

export const textLayerSchema = designLayerBaseSchema.extend({
  type: z.literal('TEXT'),
  characters: z.string(),
  textStyleId: z.string().min(1).max(120).optional(),
  styleOverrides: designTextStyleTypographySchema.partial().optional(),
  styleRuns: z.array(designRichTextRunSchema).optional(),
  style: designTypographySchema.default({}),
  fills: designPaintListSchema.default([{ type: 'SOLID', color: '#FFFFFF', opacity: 1 }]),
  /**
   * Text frame sizing policy (Figma `textAutoResize`).
   *
   * - WIDTH_AND_HEIGHT: width and height follow content; only explicit newlines wrap.
   * - HEIGHT: width is authored and height follows wrapped content.
   * - NONE: both axes are authored and editing never changes the frame.
   */
  textAutoResize: z.enum(textAutoResizeValues).default('HEIGHT'),
  /**
   * 첫 줄 잉크의 세로 앵커.
   *
   * 미지정/'NONE' — CSS 라인박스 그대로: 잉크 위에 half-leading + (em ascent − cap ascent) 만큼
   * 폰트마다 다른 여백이 얹힌다. 같은 y 라도 폰트를 바꾸면 글자가 뜨거나 가라앉는 이유.
   * 'CAP_HEIGHT' — 첫 줄 **대문자 잉크 상단이 frame.y 에 정렬**되도록 렌더러가 그 여백을 걷어낸다.
   * Figma 의 `leadingTrim: CAP_HEIGHT`, CSS `text-box: trim-both cap alphabetic` 과 같은 의미론.
   *
   * 레퍼런스 템플릿처럼 "잉크가 정확히 어디서 시작하는가" 가 디자인인 문서를 위한 것 —
   * 폰트 스왑(리브랜드)·로케일 교체 후에도 시각 앵커가 유지된다. 미지정이면 'NONE' 과 같아
   * 기존 문서와 AI 생성 경로는 영향이 없다.
   */
  leadingTrim: z.enum(leadingTrimValues).optional(),
  effects: designEffectListSchema.default([]),
}).strict()

export const imageLayerSchema = designLayerBaseSchema.extend({
  type: z.literal('IMAGE'),
  /** Orthographic image-plane tilt; absent keeps the legacy 2D document unchanged. */
  tilt: z.object({
    rotationX: z.number().min(-60).max(60),
    rotationY: z.number().min(-60).max(60),
  }).strict().optional(),
  assetRef: z.string().max(MAX_ASSET_REF_LENGTH),
  assetKind: z.enum(designImageAssetKindValues).default('unknown'),
  /**
   * A canvas object that renders a live crop of a MockupLayer screenshot.
   *
   * The object owns its placement/frame, while `sourceLayerId` owns the image
   * binding. Replacing, duplicating, or deleting the source mockup therefore
   * keeps the magnifier in sync without copying a second screenshot asset.
   */
  presentation: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('linkedMagnifier'),
      sourceLayerId: z.string().min(1).max(160),
      sourceRect: z.object({
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().positive().max(100),
        height: z.number().positive().max(100),
      }).strict(),
      /**
       * Source MockupLayer의 현재 화면 평면에서 파생한 정규화 아핀 기저.
       * rotation과 projection은 저장 호환용 파생값이다. UI Zoom의 자세는 항상 source가
       * 소유하며 생성·편집·렌더에서 다시 해석한다. 위치·크기·sourceRect는 독립이다.
       */
      projection: z.object({
        a: z.number(),
        b: z.number(),
        c: z.number(),
        d: z.number(),
      }).strict().optional(),
    }).strict(),
  ]).optional(),
  cornerRadius: z.number().min(0).optional(),
  /**
   * How the pixels map to the node box (Figma `scaleMode`): FILL = CSS object-fit
   * cover, FIT = contain, STRETCH = fill. Frames are normally sized to the image,
   * so STRETCH is the default; app icons and brand art use FIT to keep their aspect.
   */
  scaleMode: z.enum(imageScaleModeValues).default('STRETCH'),
  /**
   * Focus point (percent of the box) and zoom of the pixels, for re-framed
   * screenshot duplicates. Omitted draws the pixels unzoomed and centred
   * (`DEFAULT_IMAGE_CROP`).
   */
  crop: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    scale: z.number().positive(),
  }).strict().optional(),
  /** Adjustments of the image pixels (clipped to the box), unlike layer effects. */
  filters: z.object({
    blur: z.number().min(0).optional(),
  }).strict().default({}),
  alt: z.string().max(240).optional(),
  effects: designEffectListSchema.default([]),
}).strict().refine(
  (layer) => layer.tilt === undefined || layer.presentation?.kind !== 'linkedMagnifier',
  { message: 'Linked magnifiers inherit their source pose and cannot own image tilt.', path: ['tilt'] },
)

/** What an omitted IMAGE `crop` looks like: centred, unzoomed. */
export const DEFAULT_IMAGE_CROP = Object.freeze({ x: 50, y: 50, scale: 1 })

export const shapeLayerSchema = designLayerBaseSchema.extend({
  type: z.enum(designShapeLayerTypeValues),
  fills: designPaintListSchema.default([]),
  strokes: designPaintListSchema.default([]),
  strokeWeight: z.number().min(0).default(0),
  cornerRadius: z.number().min(0).optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() }).strict()).optional(),
  effects: designEffectListSchema.default([]),
}).strict()

export const vectorLayerSchema = designLayerBaseSchema.extend({
  type: z.literal('VECTOR'),
  svg: z.string().max(20000).optional(),
  path: z.string().max(20000).optional(),
  assetRef: z.string().max(MAX_ASSET_REF_LENGTH).optional(),
  viewBox: z.string().max(120).optional(),
  /** Empty keeps the SVG's own paint; one paint tints it. */
  fills: designPaintListSchema.default([]),
  effects: designEffectListSchema.default([]),
}).strict()

export const mockupLayerSchema = designLayerBaseSchema.extend({
  type: z.literal('MOCKUP'),
  device: z.object({
    type: z.string().default('iphone-17'),
    frameStyle: z.enum(['mockup', 'flat']).default('mockup'),
    /**
     * 바디 컬러웨이 id (`shared/constants/device-colorways`). 생략하면 GLB 원본 색.
     * 렌더러가 바디 머티리얼의 색조만 바꾸고 명암 구조는 보존한다.
     */
    colorway: z.string().max(40).optional(),
  }).strict().default({ type: 'iphone-17', frameStyle: 'mockup' }),
  screenBinding: z.object({
    appImageIndex: z.number().int().min(0).nullable().optional(),
    assetRef: z.string().max(MAX_ASSET_REF_LENGTH).optional(),
  }).strict().default({}),
  /** Active screenshot presentation. Starts as cover; manual framing may reveal the aperture. */
  screenFraming: z.object({
    focusX: z.number().min(0).max(100).default(50),
    focusY: z.number().min(0).max(100).default(50),
    /** Direct screen-space translation, measured as a percentage of the screen aperture. */
    offsetX: z.number().min(-400).max(400).optional(),
    offsetY: z.number().min(-400).max(400).optional(),
    /** 1 = initial cover scale. Manual framing may scale below it. */
    zoom: z.number().min(0.1).max(4).default(1),
    /** Effective per-axis source scale. Omitted legacy values fall back to zoom. */
    scaleX: z.number().min(0.1).max(4).optional(),
    scaleY: z.number().min(0.1).max(4).optional(),
  }).strict().optional(),
  tilt: z.object({
    rotationX: z.number().default(0),
    rotationY: z.number().default(0),
  }).strict().default({ rotationX: 0, rotationY: 0 }),
  frameStyle: z.object({
    borderRadius: z.number().min(0).optional(),
    bezelWidth: z.number().min(0).optional(),
    bezelColor: z.string().optional(),
  }).strict().default({}),
  shadow: z.object({
    enabled: z.boolean().default(true),
    blur: z.number().min(0).optional(),
    offsetY: z.number().optional(),
    color: z.string().optional(),
  }).strict().default({ enabled: true }),
  effects: designEffectListSchema.default([]),
}).strict()

export const designLayerSchema: z.ZodType<
  | z.infer<typeof textLayerSchema>
  | z.infer<typeof imageLayerSchema>
  | z.infer<typeof shapeLayerSchema>
  | z.infer<typeof vectorLayerSchema>
  | z.infer<typeof mockupLayerSchema>
  | (DesignLayerBase & { type: 'GROUP'; children: DesignLayer[] })
> = z.lazy(() => z.discriminatedUnion('type', [
  textLayerSchema,
  imageLayerSchema,
  shapeLayerSchema,
  vectorLayerSchema,
  mockupLayerSchema,
  designLayerBaseSchema.extend({
    type: z.literal('GROUP'),
    children: z.array(designLayerSchema).default([]),
  }).strict(),
]))

export const designAssetSchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum(designImageAssetKindValues),
  url: z.string().max(1200).optional(),
  dataUri: z.string().max(2_000_000).optional(),
  label: z.string().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** SHA-256 of the asset bytes (lowercase hex). */
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** Where the bytes came from. `sourceClone` marks assets cut from a cloned source design. */
  origin: z.enum(['sourceClone', 'user', 'generated', 'brand']).optional(),
  /** The page or file the bytes were taken from, when known. */
  sourceUrl: z.string().max(2000).optional(),
}).strict()

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(designDocumentSchemaVersion),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    /**
     * 슬라이드 사이에 **디자인 공간으로 존재하는** 간격 (px). 기본 0 = 슬라이드가 맞닿음.
     *
     * 앱스토어 갤러리는 스크린샷을 나란히 놓되 사이를 띄워서 보여준다. 덱 전체를 한 장의
     * 그림처럼 쓰는 파노라마 연출은 그 간격만큼을 비워둬야 스토어에서 이어져 보인다.
     * gutter > 0 이면 슬라이드 k 는 x = k·(width + gutter) 에 놓이고, 간격에 걸친 픽셀은
     * 어떤 슬라이드에도 안 들어간다 (= 내보내기에서 사라진다). 이건 결함이 아니라 의도다.
     *
     * 에디터의 시각적 간격(SCREENSHOT_GAP)과는 별개다 — 그건 편집 편의를 위한 표시일 뿐
     * 좌표에 영향이 없다.
     */
    gutter: z.number().min(0).max(1000).optional(),
  }).strict(),
  /** Slides in order; `index` equals the array position. */
  frames: z.array(z.object({
    type: z.literal('FRAME'),
    id: z.string().min(1).max(160),
    index: z.number().int().min(0),
    fills: designPaintListSchema.default([]),
    children: z.array(designLayerSchema).default([]),
  }).strict()),
  assets: z.array(designAssetSchema).default([]),
  /** Deck design tokens in the W3C Design Tokens format (DTCG 2025.10). */
  tokens: z.object({
    /** Semantic deck colors are optional for hand-authored documents. New AI
     *  generation always materializes the approved analysis palette here. */
    color: designColorTokenGroupSchema.optional(),
    /** Deck text styles. Hand-authored documents may omit them; generation
     *  compilers always materialize them before a document reaches the editor. */
    typography: designTypographyTokenGroupSchema.optional(),
  }).strict().optional(),
  /** Opt-in template post-generation layout policy. Absent legacy seals stay unchanged. */
  resolutionAdaptation: resolutionAdaptationSchema.optional(),
}).strict()

export type DesignDocument = z.infer<typeof designDocumentSchema>
export type DesignSlide = DesignDocument['frames'][number]
export type DesignLayerType = (typeof designLayerTypeValues)[number]
export type DesignShapeLayerType = (typeof designShapeLayerTypeValues)[number]
export type DesignImageAssetKind = (typeof designImageAssetKindValues)[number]
export type DesignProvenance = z.infer<typeof designProvenanceSchema>
export type DesignPaint = z.infer<typeof designPaintSchema>
export type DesignSolidPaint = Extract<DesignPaint, { type: 'SOLID' }>
export type DesignLinearGradientPaint = Extract<DesignPaint, { type: 'GRADIENT_LINEAR' }>
export type DesignRadialGradientPaint = Extract<DesignPaint, { type: 'GRADIENT_RADIAL' }>
export type DesignGradientPaint = DesignLinearGradientPaint | DesignRadialGradientPaint
export type DesignImagePaint = Extract<DesignPaint, { type: 'IMAGE' }>
export type DesignGradientStop = z.infer<typeof designGradientStopSchema>
/** A shape's stroke as one value: its first stroke paint and the stroke weight. */
export type DesignStroke = { paint: DesignPaint; width: number }
export type DesignEffect = z.infer<typeof designEffectSchema>
export type DesignDropShadowEffect = z.infer<typeof designDropShadowEffectSchema>
export type DesignAsset = z.infer<typeof designAssetSchema>
export type DesignTextStyle = z.infer<typeof designTextStyleSchema>
export type DesignTypographyToken = z.infer<typeof designTypographyTokenSchema>
export type DesignTypographyTokenGroup = z.infer<typeof designTypographyTokenGroupSchema>
export type DesignTextStyleRole = (typeof designTextStyleRoleValues)[number]
export type TextLayer = z.infer<typeof textLayerSchema>
export type ImageLayer = z.infer<typeof imageLayerSchema>
export type ShapeLayer = z.infer<typeof shapeLayerSchema>
export type VectorLayer = z.infer<typeof vectorLayerSchema>
export type MockupLayer = z.infer<typeof mockupLayerSchema>
export type LayerMetadata = DesignLayerMetadata

/**
 * An image layer that is not an independent raster asset, but a live detail crop
 * of a source mockup's app UI. The persisted discriminator remains
 * `linkedMagnifier` for backwards compatibility; product surfaces call this
 * semantic object “UI Zoom”.
 */
export type UiZoomLayer = ImageLayer & {
  presentation: Extract<NonNullable<ImageLayer['presentation']>, { kind: 'linkedMagnifier' }>
}

export function isUiZoomLayer(layer: DesignLayer): layer is UiZoomLayer {
  return layer.type === 'IMAGE' && layer.presentation?.kind === 'linkedMagnifier'
}

/** Shape names used by model-facing plans and authoring contracts. */
export type DesignShapeName = 'rectangle' | 'ellipse' | 'line' | 'polygon'

const SHAPE_LAYER_TYPE_BY_NAME = {
  rectangle: 'RECTANGLE',
  ellipse: 'ELLIPSE',
  line: 'LINE',
  polygon: 'POLYGON',
} as const satisfies Record<DesignShapeName, DesignShapeLayerType>

export function shapeLayerType(shape: DesignShapeName): DesignShapeLayerType {
  return SHAPE_LAYER_TYPE_BY_NAME[shape]
}

export function isShapeLayerType(type: unknown): type is DesignShapeLayerType {
  return typeof type === 'string' && (designShapeLayerTypeValues as readonly string[]).includes(type)
}

/** Editor grouping of layer types: the four shape types share one category. */
export type DesignLayerCategory = Exclude<DesignLayerType, DesignShapeLayerType> | 'SHAPE'

export function designLayerCategory(type: DesignLayerType): DesignLayerCategory {
  return isShapeLayerType(type) ? 'SHAPE' : type
}

/** Lower-case layer kind names used by generation contracts (layout protocol, plans). */
export type DesignLayerKindName = 'text' | 'image' | 'shape' | 'vector' | 'mockup' | 'group'

export function designLayerKindName(type: DesignLayerType): DesignLayerKindName {
  return designLayerCategory(type).toLowerCase() as DesignLayerKindName
}

export function isGradientPaint(paint: DesignPaint | undefined): paint is DesignGradientPaint {
  return paint?.type === 'GRADIENT_LINEAR' || paint?.type === 'GRADIENT_RADIAL'
}

/** Paint names used by model contracts, prompts and hashes, which keep the pre-Figma vocabulary. */
export type DesignPaintKindName = 'solid' | 'gradient' | 'image'

export function designPaintKindName(paint: DesignPaint): DesignPaintKindName {
  return paint.type === 'SOLID' ? 'solid' : paint.type === 'IMAGE' ? 'image' : 'gradient'
}

export type GradientTypeName = 'linear' | 'radial'

export function gradientTypeName(paint: DesignGradientPaint): GradientTypeName {
  return paint.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear'
}

/** CSS `object-fit`/`background-size` names for a scale mode. */
export type ImageFitName = 'cover' | 'contain' | 'fill'

const IMAGE_FIT_NAMES: Record<ImageScaleMode, ImageFitName> = { FILL: 'cover', FIT: 'contain', STRETCH: 'fill' }

export function imageFitName(scaleMode: ImageScaleMode): ImageFitName {
  return IMAGE_FIT_NAMES[scaleMode]
}

/** A deck text style as a DTCG typography token. */
export function designTypographyToken(style: DesignTextStyle): DesignTypographyToken {
  const { name, role, variant, source, typography } = style
  return {
    $type: 'typography',
    $value: dtcgTypographyValue(typography),
    $extensions: { crescreendo: { name, role, variant, source, style: typography } },
  }
}

/** The document typography token `id` as a deck text style. */
export function designTextStyleFromToken(id: string, token: DesignTypographyToken): DesignTextStyle {
  const { name, role, variant, source, style } = token.$extensions.crescreendo
  return { id, name, role, variant, typography: style, source }
}

/** The DTCG `typography` group holding `styles`, in their order. Style ids must be unique. */
export function designTypographyTokenGroup(styles: readonly DesignTextStyle[]): DesignTypographyTokenGroup {
  const group: DesignTypographyTokenGroup = {}
  for (const style of styles) {
    const name = typographyTokenName(style.id)
    if (Object.hasOwn(group, name)) throw new Error(`Duplicate text style id ${style.id}.`)
    group[name] = designTypographyToken(style)
  }
  return group
}

/** The document's text styles, in deck order. */
export function documentTextStyles(document: Pick<DesignDocument, 'tokens'>): DesignTextStyle[] {
  return Object.entries(document.tokens?.typography ?? {}).map(([name, token]) => designTextStyleFromToken(textStyleIdFromTokenName(name), token))
}

/** The document's text style `id`, if it has one. */
export function documentTextStyle(document: Pick<DesignDocument, 'tokens'>, id: string): DesignTextStyle | undefined {
  const group = document.tokens?.typography
  const name = typographyTokenName(id)
  return group && Object.hasOwn(group, name) ? designTextStyleFromToken(id, group[name]!) : undefined
}

/** The document with its text styles replaced; `undefined` removes the typography group. */
export function withDocumentTextStyles<T extends Pick<DesignDocument, 'tokens'>>(
  document: T,
  styles: readonly DesignTextStyle[] | undefined,
): T {
  const { tokens: current, ...rest } = document
  const { typography: _typography, ...others } = current ?? {}
  const next = styles ? { ...others, typography: designTypographyTokenGroup(styles) } : others
  return (Object.keys(next).length ? { ...rest, tokens: next } : rest) as T
}

/** The document's color tokens as deck color tokens (`color/…` ids), in deck order. */
export function documentColorTokens(document: Pick<DesignDocument, 'tokens'>): DeckColorToken[] {
  return Object.entries(document.tokens?.color ?? {}).map(([name, token]) => deckColorToken(name, token))
}

/** The document with its color tokens replaced; `undefined` removes the color group. */
export function withDocumentColorTokens<T extends Pick<DesignDocument, 'tokens'>>(
  document: T,
  tokens: readonly DeckColorTokenInput[] | undefined,
): T {
  const { tokens: current, ...rest } = document
  const { color: _color, ...others } = current ?? {}
  const next = tokens ? { ...others, color: designColorTokenGroup(tokens) } : others
  return (Object.keys(next).length ? { ...rest, tokens: next } : rest) as T
}

/** The `color/…` id of the document color token a paint or gradient stop uses. */
export function paintTokenId(paint: { token?: ColorTokenAlias }): ColorTokenId | undefined {
  return paint.token ? colorTokenIdFromAlias(paint.token) : undefined
}

/** The single paint of a paint list, or undefined when the list is empty. */
export function firstPaint(paints: readonly DesignPaint[] | undefined): DesignPaint | undefined {
  return paints?.[0]
}

/** A paint list holding `paint`; no paint is the empty list. */
export function paintList(paint: DesignPaint | undefined): DesignPaint[] {
  return paint ? [paint] : []
}

/** A shape's stroke, or undefined when it has no stroke paint. */
export function layerStroke(layer: Pick<ShapeLayer, 'strokes' | 'strokeWeight'>): DesignStroke | undefined {
  const paint = layer.strokes[0]
  return paint ? { paint, width: layer.strokeWeight } : undefined
}

/** Shape stroke fields for a stroke value; no stroke clears both. */
export function strokeFields(stroke: DesignStroke | undefined): Pick<ShapeLayer, 'strokes' | 'strokeWeight'> {
  return stroke ? { strokes: [stroke.paint], strokeWeight: stroke.width } : { strokes: [], strokeWeight: 0 }
}

/** Text resize names used by model contracts (locale text slots), which keep the pre-Figma vocabulary. */
export type TextSizingName = 'autoWidth' | 'autoHeight' | 'fixed'

const TEXT_SIZING_NAMES: Record<TextAutoResize, TextSizingName> = {
  WIDTH_AND_HEIGHT: 'autoWidth',
  HEIGHT: 'autoHeight',
  NONE: 'fixed',
}

export function textSizingName(mode: TextAutoResize): TextSizingName {
  return TEXT_SIZING_NAMES[mode]
}

/** Leading trim name used by the renderer's DOM contract (`data-design-text-vertical-trim`) and render issues. */
export type VerticalTrimName = 'none' | 'cap'

export function verticalTrimName(trim: LeadingTrim | undefined): VerticalTrimName {
  return trim === 'CAP_HEIGHT' ? 'cap' : 'none'
}

export function isShapeLayer(layer: DesignLayer | null | undefined): layer is ShapeLayer
export function isShapeLayer<T extends { type?: unknown }>(layer: T | null | undefined): layer is T & { type: DesignShapeLayerType }
export function isShapeLayer(layer: { type?: unknown } | null | undefined): boolean {
  return !!layer && isShapeLayerType(layer.type)
}

export interface DesignLayerPatch {
  layerId: string
  patch: Partial<DesignLayer>
}
