import { isShapeLayerType, type DesignLayer } from './design-document'
import type { LayerConstraint, LayerEditScope } from './metadata'

type PatchRecord = Record<string, unknown>
type Scope = LayerEditScope

export type DesignLayerMutationBlockReason =
  | 'layer-locked'
  | `constraint-${LayerConstraint}`
  | `edit-scope-${LayerEditScope}-not-allowed`

export interface DesignLayerMutationPolicyDecision {
  allowed: boolean
  reason?: DesignLayerMutationBlockReason
}

const DELETE_BLOCKING_CONSTRAINTS: readonly LayerConstraint[] = [
  'preserveGeometry',
  'preserveStyle',
  'preserveContent',
  'preserveSourceBinding',
  'lockPosition',
  'lockSize',
  'lockText',
  'lockAsset',
]

function constraints(layer: DesignLayer): Set<string> {
  return new Set(layer.extensions?.crescreendo?.constraints ?? [])
}

function editScope(layer: DesignLayer): Set<string> {
  return new Set(layer.extensions?.crescreendo?.editScope ?? [])
}

function blockingConstraintForScope(
  layer: DesignLayer,
  scope: Scope,
): LayerConstraint | undefined {
  const locked = constraints(layer)
  if (scope === 'position' && (locked.has('lockPosition') || locked.has('preserveGeometry'))) {
    return locked.has('lockPosition') ? 'lockPosition' : 'preserveGeometry'
  }
  if (scope === 'size' && (locked.has('lockSize') || locked.has('preserveGeometry'))) {
    return locked.has('lockSize') ? 'lockSize' : 'preserveGeometry'
  }
  if (scope === 'text' && (locked.has('lockText') || locked.has('preserveContent'))) {
    return locked.has('lockText') ? 'lockText' : 'preserveContent'
  }
  if (scope === 'asset' && (locked.has('lockAsset') || locked.has('preserveSourceBinding'))) {
    return locked.has('lockAsset') ? 'lockAsset' : 'preserveSourceBinding'
  }
  if (scope === 'binding' && locked.has('preserveSourceBinding')) return 'preserveSourceBinding'
  if ((scope === 'style' || scope === 'effects') && locked.has('preserveStyle')) return 'preserveStyle'
  if (scope === 'children' && locked.has('preserveContent')) return 'preserveContent'
  if (scope === 'delete') {
    return DELETE_BLOCKING_CONSTRAINTS.find((constraint) => locked.has(constraint))
  }
  return undefined
}

export function evaluateDesignLayerMutationPolicy(
  layer: DesignLayer,
  scope: LayerEditScope,
): DesignLayerMutationPolicyDecision {
  if (layer.locked || layer.extensions?.crescreendo?.locked) {
    return { allowed: false, reason: 'layer-locked' }
  }

  const blockingConstraint = blockingConstraintForScope(layer, scope)
  if (blockingConstraint) {
    return { allowed: false, reason: `constraint-${blockingConstraint}` }
  }

  const scopes = editScope(layer)
  if (scopes.size > 0 && !scopes.has(scope)) {
    return { allowed: false, reason: `edit-scope-${scope}-not-allowed` }
  }

  return { allowed: true }
}

export function designLayerAllowsMutation(
  layer: DesignLayer,
  scope: LayerEditScope,
): boolean {
  return evaluateDesignLayerMutationPolicy(layer, scope).allowed
}

function layerAllowsScope(layer: DesignLayer, scope: Scope): boolean {
  return designLayerAllowsMutation(layer, scope)
}

function setIfAllowed(
  layer: DesignLayer,
  out: PatchRecord,
  key: string,
  value: unknown,
  scopes: Scope[],
) {
  if (scopes.some((scope) => layerAllowsScope(layer, scope))) {
    out[key] = value
  }
}

function filterFramePatch(layer: DesignLayer, framePatch: unknown): DesignLayer['frame'] | undefined {
  if (!framePatch || typeof framePatch !== 'object') return undefined
  const incoming = framePatch as Partial<DesignLayer['frame']>
  const frame = { ...layer.frame }
  let changed = false

  if (incoming.x !== undefined && layerAllowsScope(layer, 'position')) {
    frame.x = incoming.x
    changed = true
  }
  if (incoming.y !== undefined && layerAllowsScope(layer, 'position')) {
    frame.y = incoming.y
    changed = true
  }
  if (incoming.width !== undefined && layerAllowsScope(layer, 'size')) {
    frame.width = incoming.width
    changed = true
  }
  if (incoming.height !== undefined && layerAllowsScope(layer, 'size')) {
    frame.height = incoming.height
    changed = true
  }

  return changed ? frame : undefined
}

function patchScopeForKey(key: string): Scope[] {
  switch (key) {
    case 'frame':
      return ['position', 'size']
    case 'rotation':
      return ['position']
    case 'characters':
    case 'styleRuns':
      return ['text']
    case 'assetRef':
      return ['asset']
    case 'screenBinding':
      return ['asset', 'binding']
    case 'tilt':
    case 'effects':
    case 'scaleMode':
    case 'crop':
    case 'filters':
    case 'screenFraming':
    case 'shadow':
      return ['effects']
    case 'visible':
      return ['visibility']
    case 'opacity':
      return ['effects']
    case 'children':
      return ['children']
    case 'style':
    case 'fills':
    case 'strokes':
    case 'strokeWeight':
    case 'cornerRadius':
    case 'points':
    case 'frameStyle':
    case 'device':
    case 'svg':
    case 'path':
    case 'viewBox':
      return ['style']
    default:
      return ['style']
  }
}

export function filterDesignLayerPatchByPolicy(
  layer: DesignLayer,
  patch: Partial<DesignLayer>,
): Partial<DesignLayer> | null {
  const record = patch as PatchRecord
  const out: PatchRecord = {}

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue
    if (key === 'type') {
      // Switching between shape types is the old `shape` style edit; any other type change is structural.
      if (value !== layer.type && isShapeLayerType(layer.type) && isShapeLayerType(value)) {
        setIfAllowed(layer, out, key, value, ['style'])
      }
      continue
    }
    if (key === 'locked' || key === 'extensions' || key === 'provenance' || key === 'name') {
      out[key] = value
      continue
    }
    if (key === 'frame') {
      const frame = filterFramePatch(layer, value)
      if (frame) out.frame = frame
      continue
    }
    if (key === 'screenBinding') {
      if (layerAllowsScope(layer, 'asset') && layerAllowsScope(layer, 'binding')) {
        out.screenBinding = value
      }
      continue
    }
    setIfAllowed(layer, out, key, value, patchScopeForKey(key))
  }

  return Object.keys(out).length > 0 ? out as Partial<DesignLayer> : null
}
