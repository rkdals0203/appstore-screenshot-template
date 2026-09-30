import { z } from 'zod/v4'

/**
 * Opt-in template post-generation layout policy (pure schema). Kept apart from
 * `resolution-adaptation.ts` so the document schema can use it without an
 * import cycle through the layer hierarchy helpers.
 */
const stableId = z.string().min(1).max(160)
const dimensions = z.object({ width: z.number().positive().max(32768), height: z.number().positive().max(32768) }).strict()
export const resolutionAdaptationSchema = z.object({
  schemaVersion: z.literal(1),
  base: dimensions,
  presets: z.array(dimensions.extend({ id: stableId }).strict()).min(1).max(16),
  groups: z.array(z.object({
    id: stableId, layerIds: z.array(stableId).min(1).max(1000),
    anchor: z.object({ slideId: stableId, x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
    mode: z.enum(['uniform', 'text-width']),
  }).strict()).max(1000),
}).strict().superRefine((policy, ctx) => {
  for (const [field, values] of [
    ['presets', policy.presets.map(preset => preset.id)],
    ['groups', policy.groups.map(group => group.id)],
    ['groups', policy.groups.flatMap(group => group.layerIds)],
  ] as const) {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [field], message: 'Resolution identities and group ownership must be unique.' })
  }
})

export type ResolutionAdaptation = z.infer<typeof resolutionAdaptationSchema>
