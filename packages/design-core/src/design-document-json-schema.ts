import { z } from 'zod/v4'
import {
  designDocumentSchema,
  designEffectSchema,
  designLayerExtensionsSchema,
  designLayerSchema,
  designPaintSchema,
  designTypographySchema,
} from './design-document'

export const DESIGN_DOCUMENT_JSON_SCHEMA_ID = 'https://crescreendo.com/schema/design-document.schema.json'

/**
 * Public JSON Schema of the DesignDocument, generated from the Zod schema the
 * runtime validates with. Describes the stored shape (defaults applied). Code-level
 * refinements such as unique node ids are not expressible here and stay in the
 * validator. Definition names come from a local registry so that generating this
 * schema never changes how the same Zod schemas appear in model tool schemas.
 */
export function designDocumentJsonSchema(): Record<string, unknown> {
  const definitions = z.registry<{ id: string }>()
  definitions.add(designLayerSchema, { id: 'DesignLayer' })
  definitions.add(designPaintSchema, { id: 'Paint' })
  definitions.add(designEffectSchema, { id: 'Effect' })
  definitions.add(designTypographySchema, { id: 'TypeStyle' })
  definitions.add(designLayerExtensionsSchema, { id: 'LayerExtensions' })
  const schema = {
    ...z.toJSONSchema(designDocumentSchema, {
      target: 'draft-2020-12', io: 'output', cycles: 'ref', unrepresentable: 'any', metadata: definitions,
    }),
    $id: DESIGN_DOCUMENT_JSON_SCHEMA_ID,
    title: 'Crescreendo DesignDocument',
  }
  // This cross-field rule is representable in JSON Schema, but Zod refinements
  // are not emitted automatically. Keep JSON authoring and runtime validation aligned.
  function constrainImages(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, any>
    if (node.properties?.type?.const === 'IMAGE') {
      node.allOf = [{ if: { required: ['presentation'], properties: {
        presentation: { required: ['kind'], properties: { kind: { const: 'linkedMagnifier' } } },
      } }, then: { not: { required: ['tilt'] } } }]
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(constrainImages)
      else constrainImages(child)
    }
  }
  constrainImages(schema)
  return schema
}
