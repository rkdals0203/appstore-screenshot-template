import { z } from 'zod/v4'

export const layerRoleValues = [
  'root',
  'slideBackground',
  'backgroundPhoto',
  'backgroundPattern',
  'backgroundGradient',
  'backgroundAtmosphere',
  'heroHeadline',
  'subheadline',
  'kicker',
  'brandMark',
  'appIcon',
  'primaryMockup',
  'secondaryMockup',
  'appScreenshot',
  'blurredUiEcho',
  'fullBleedAppScreen',
  'uiPanel',
  'proofCard',
  'featureIcon',
  'decorativeIcon',
  'decorativeArrow',
  'callout',
  'sticker',
  'badge',
  'productPhoto',
  'humanFigure',
  'generatedPerson',
  'generatedIllustration',
  'retainedIllustration',
  'mapTexture',
  'dataVisualization',
  'chart',
  'artworkScene',
  'contentCard',
  'deviceShadow',
  'frameOutline',
  'storeBadge',
] as const

export const replacementPolicyValues = [
  'bindToUserScreenshot',
  'bindToUserScreenshotDuplicate',
  'replaceWithAppIcon',
  'replaceWithBrandAsset',
  'recolorToBrand',
  'rewriteCopy',
  'localizeText',
  'regenerateForCategory',
  'keepAsAtmosphere',
  'preserveGeometry',
  'removeIfIrrelevant',
  'doNotCopySourceIdentity',
] as const

export const layerBindingKindValues = [
  'appScreenshot',
  'appScreenshotDuplicate',
  'appIcon',
  'brandAsset',
  'storeBadge',
  'copySlot',
  'themeToken',
  'generatedAsset',
  'referenceLayer',
  'none',
] as const

export const layerConstraintValues = [
  'preserveGeometry',
  'preserveStyle',
  'preserveContent',
  'preserveSourceBinding',
  'lockPosition',
  'lockSize',
  'lockText',
  'lockAsset',
  'keepWithinSafeArea',
  'avoidFakeUi',
  'avoidSourceIdentity',
  'keepReadableAtThumbnail',
] as const

export const layerEditScopeValues = [
  'position',
  'size',
  'style',
  'text',
  'asset',
  'binding',
  'effects',
  'children',
  'visibility',
  'delete',
] as const

export const layerSourceKindValues = [
  'userScreenshot',
  'userAppIcon',
  'brandAsset',
  'generated',
  'referenceStyle',
  'localReference',
  'remoteUrl',
  'derived',
] as const

export const layerEffectValues = [
  'blur',
  'backgroundBlur',
  'gradient',
  'mask',
  'shadow',
  'glow',
  'noise',
  'glass',
  'overlay',
  'duotone',
  'perspective',
  'crop',
  'opacity',
  'blend',
  'roundedClip',
] as const

export const layerRoleSchema = z.enum(layerRoleValues)
export const replacementPolicySchema = z.enum(replacementPolicyValues)
export const layerBindingKindSchema = z.enum(layerBindingKindValues)
export const layerConstraintSchema = z.enum(layerConstraintValues)
export const layerEditScopeSchema = z.enum(layerEditScopeValues)
export const layerSourceKindSchema = z.enum(layerSourceKindValues)
export const layerEffectSchema = z.enum(layerEffectValues)

export const layerSourceSchema = z.object({
  kind: layerSourceKindSchema,
  id: z.string().max(120).optional(),
  description: z.string().max(240).optional(),
}).strict()

export const layerBindingSchema = z.object({
  kind: layerBindingKindSchema,
  target: z.string().max(120).optional(),
  required: z.boolean().optional(),
  description: z.string().max(240).optional(),
}).strict()

export const designLayerMetadataSchema = z.object({
  role: layerRoleSchema.optional(),
  /** Stable semantic relation owned by this one canonical HOME layer. Derived window clones inherit it. */
  relationId: z.string().min(1).max(160).optional(),
  /** Canonical screenshot root shared by explicit template aliases, including empty slots. */
  screenshotSourceLayerId: z.string().min(1).max(160).optional(),
  /**
   * Projection ownership for a top-level canonical layer.
   *
   * - `home`: clip overflow at the HOME slide instead of deriving neighbouring-window clones.
   * - `panorama`: allow the canonical root to project through neighbouring slide windows.
   * - omitted: preserve the historical geometry-driven projection behaviour for old documents.
   *
   * Strict freeform compilation writes this field deterministically; the model does not own it.
   */
  projectionScope: z.enum(['home', 'panorama']).optional(),
  /** Global paint band for a canonical panorama root. Omitted preserves legacy deck order. */
  panoramaPaintOrder: z.enum(['background', 'foreground']).optional(),
  /** Explicit deck-wide stacking for a measured Freeform composition. */
  panoramaPaintIndex: z.number().int().nonnegative().optional(),
  label: z.string().max(80).optional(),
  source: layerSourceSchema.optional(),
  binding: layerBindingSchema.optional(),
  constraints: z.array(layerConstraintSchema).max(8).optional(),
  editScope: z.array(layerEditScopeSchema).max(8).optional(),
  designIntent: z.string().max(240).optional(),
  replacementPolicy: z.array(replacementPolicySchema).max(4).optional(),
  effects: z.array(layerEffectSchema).max(8).optional(),
  locked: z.boolean().optional(),
  notes: z.string().max(240).optional(),
}).strict()

export type DesignLayerMetadata = z.infer<typeof designLayerMetadataSchema>
export type LayerBinding = z.infer<typeof layerBindingSchema>
export type LayerConstraint = z.infer<typeof layerConstraintSchema>
export type LayerEditScope = z.infer<typeof layerEditScopeSchema>
