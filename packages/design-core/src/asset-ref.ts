export function addAssetRefAliases(refs: Set<string>, assetRef: string | undefined) {
  const normalized = assetRef?.trim()
  if (!normalized) return
  refs.add(normalized)
  if (isRuntimeResolvedAssetRef(normalized)) return
  if (normalized.startsWith('asset:') && !normalized.startsWith('asset://')) {
    refs.add(normalized.slice('asset:'.length))
  } else {
    refs.add(`asset:${normalized}`)
  }
}

export function collectAssetRefAliases(assetRefs: Iterable<string | undefined>): Set<string> {
  const refs = new Set<string>()
  for (const assetRef of assetRefs) addAssetRefAliases(refs, assetRef)
  return refs
}

export function isRuntimeResolvedAssetRef(assetRef: string): boolean {
  const normalized = assetRef.trim()
  return (
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ||
    /^(data|blob):/i.test(normalized)
  )
}

export function isManifestQualifiedAssetRef(assetRef: string): boolean {
  const normalized = assetRef.trim()
  return normalized.startsWith('asset:') && !normalized.startsWith('asset://')
}
