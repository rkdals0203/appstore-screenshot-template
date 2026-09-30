import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { z } from 'zod/v4'
import { readRaster } from './raster.js'
import { sha256, readProjectFile, writeProjectFile } from './files.js'

export const PORTING_STOREFRONTS = ['us', 'ca', 'gb', 'au', 'kr', 'jp', 'de', 'fr', 'es', 'it', 'nl', 'br', 'pt', 'tr', 'sa', 'in'] as const
export function appSourceIdentity(input: string) {
  if (/^\d+$/.test(input)) return { appId: input, storefront: 'us' }
  const url = new URL(input)
  const match = url.pathname.match(/^\/([a-z]{2})\/app\/(?:[^/]+\/)?id(\d+)\/?$/)
  if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || url.username || url.password || url.port || !match) throw new Error('invalid-app-store-url')
  return { appId: match[2], storefront: match[1] }
}
export function parseAppStoreScreenshots(html: string, appId: string, storefront: string, shelfId?: string) {
  const raw = html.match(/<script[^>]*\bid="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!raw) throw new Error('apple-public-page-data-missing')
  const payload = z.object({ data: z.array(z.object({
    intent: z.object({ storefront: z.string(), language: z.string(), id: z.string() }),
    data: z.object({ shelfMapping: z.record(z.string(), z.unknown()) }),
  })) }).parse(JSON.parse(raw))
  const page = payload.data.find(p => p.intent.id === appId && p.intent.storefront === storefront)
  if (!page) throw new Error('source-app-or-storefront-mismatch')
  const shelves = Object.entries(page.data.shelfMapping).filter(([key]) => key.startsWith('product_media_phone_'))
  const selected = shelfId ? shelves.filter(([key]) => key === shelfId) : shelves
  if (selected.length !== 1) throw new Error(`phone-media-ambiguous:${shelves.map(([key]) => key).join(',')}`)
  const artwork = z.object({ template: z.string(), width: z.number().int().positive(), height: z.number().int().positive() })
  const media = z.union([
    z.object({ screenshot: artwork, video: z.never().optional() }),
    z.object({ video: z.object({ videoUrl: z.url() }), screenshot: z.never().optional() }),
  ])
  const shelf = z.object({ items: z.array(media).min(1).max(100) }).parse(selected[0][1])
  const screenshots = shelf.items.flatMap((item, mediaIndex) => item.screenshot ? [{ screenshot: item.screenshot, mediaIndex }] : [])
  if (!screenshots.length) throw new Error('phone-screenshots-missing')
  return { storefront, pageLanguage: page.intent.language, shelfId: selected[0][0],
    skippedPreviews: shelf.items.flatMap((item, mediaIndex) => item.video ? [{ mediaIndex, url: item.video.videoUrl }] : []),
    screenshots: screenshots.map(({ screenshot, mediaIndex }, index) => {
    const url = screenshot.template.replaceAll('{w}', String(screenshot.width)).replaceAll('{h}', String(screenshot.height)).replaceAll('{c}', 'bb').replaceAll('{f}', 'png')
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.mzstatic.com') || /[{}]/.test(url) || parsed.username || parsed.password || parsed.port) throw new Error('apple-artwork-url-invalid')
    return { index, mediaIndex, url, reportedWidth: screenshot.width, reportedHeight: screenshot.height }
  }) }
}
async function fetchBytes(url: string, maxBytes: number, fetchImpl: typeof fetch) {
  const original = new URL(url)
  let current = original
  const signal = AbortSignal.timeout(30_000)
  let response: Response
  for (let redirects = 0; ; redirects++) {
    response = await fetchImpl(current.href, { redirect: 'manual', signal })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location || redirects >= 3) throw new Error('source-redirect-limit')
    const next = new URL(location, current)
    if (next.origin !== original.origin || next.username || next.password) throw new Error('source-redirect-origin')
    // Apple adds the localized slug to /app/idNNN. Never follow a different app or storefront.
    if (original.hostname === 'apps.apple.com') {
      const from = appSourceIdentity(original.href), to = appSourceIdentity(next.href)
      if (from.appId !== to.appId || from.storefront !== to.storefront) throw new Error('source-redirect-identity')
    }
    current = next
  }
  if (!response.ok || !response.body) throw new Error(`public-source-http-${response.status}`)
  const chunks: Uint8Array[] = []; let size = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length; if (size > maxBytes) throw new Error('source-too-large'); chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
export async function captureAppStoreSource(input: { app: string; directory: string; storefronts?: string[]; shelfId?: string; fetchImpl?: typeof fetch }) {
  const { appId, storefront: base } = appSourceIdentity(input.app)
  const storefronts = [...new Set(input.storefronts ?? [base])]
  if (!storefronts.length || storefronts.some(s => !/^[a-z]{2}$/.test(s))) throw new Error('invalid-storefronts')
  const fetchImpl = input.fetchImpl ?? fetch
  const captures = []; const failures = []; const capturedAt = new Date().toISOString()
  // Reuse the old app-specific collector's files too, without modifying those records.
  const legacyCache = new Map<string, { file: string; sha256: string; width: number; height: number; bytes: number }>()
  const names = await readdir(input.directory).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e })
  for (const name of names.filter(n => /^capture-[a-f0-9]+\.json$/.test(n))) {
    try {
      const prior = JSON.parse((await readProjectFile(input.directory, name)).toString('utf8'))
      for (const capture of prior.captures ?? []) for (const shot of capture.screenshots ?? []) {
        if (typeof shot.url === 'string' && /^assets\/[a-f0-9]{64}\.png$/.test(shot.file)) legacyCache.set(shot.url, shot)
      }
    } catch { /* Old malformed or unsuccessful records are not evidence of a completed capture. */ }
  }
  for (const storefront of storefronts) {
    try {
      const pageUrl = `https://apps.apple.com/${storefront}/app/id${appId}`
      const html = await fetchBytes(pageUrl, 3_000_000, fetchImpl)
      const pageFile = `pages/${sha256(html)}.html`
      await writeProjectFile(input.directory, pageFile, html)
      const page = parseAppStoreScreenshots(html.toString('utf8'), appId, storefront, input.shelfId)
      const screenshots = []
      for (const item of page.screenshots) {
        // URL metadata cache is content checked, not a reason to overwrite old captures.
        const cachePath = `url-cache/${sha256(item.url)}.json`
        let asset: { file: string; sha256: string; width: number; height: number; bytes: number } | undefined
        try {
          const cached = await readProjectFile(input.directory, cachePath).then(bytes => JSON.parse(bytes.toString('utf8'))).catch(() => legacyCache.get(item.url))
          if (!cached) throw new Error('no-cache')
          if (!/^assets\/[a-f0-9]{64}\.png$/.test(cached.file)) throw new Error('bad-cache')
          const bytes = await readProjectFile(input.directory, cached.file, cached.sha256)
          if (sha256(bytes) === cached.sha256 && cached.width === item.reportedWidth && cached.height === item.reportedHeight && bytes.length === cached.bytes) asset = cached
        } catch { /* No usable cached bytes: fetch the immutable URL again. */ }
        if (!asset) {
          const bytes = await fetchBytes(item.url, 25 * 1024 * 1024, fetchImpl)
          const decoded = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata()
          if (decoded.format !== 'png' || decoded.width !== item.reportedWidth || decoded.height !== item.reportedHeight) throw new Error('source-delivered-dimensions-mismatch')
          await sharp(bytes, { limitInputPixels: 40_000_000 }).stats()
          const hash = sha256(bytes)
          asset = { file: `assets/${hash}.png`, sha256: hash, width: decoded.width!, height: decoded.height!, bytes: bytes.length }
          await writeProjectFile(input.directory, asset.file, bytes)
          await writeProjectFile(input.directory, cachePath, JSON.stringify(asset))
        }
        screenshots.push({ ...item, ...asset })
      }
      captures.push({ ...page, screenshots, pageUrl, pageFile, capturedAt, pageSha256: sha256(html),
        imageCopyLanguage: null, imageCopyLanguageStatus: 'requires-visual-review', setHash: sha256(JSON.stringify(screenshots.map(s => s.sha256))) })
    } catch (error) { failures.push({ storefront, error: error instanceof Error ? error.message : 'capture-failed' }) }
  }
  const artifact = { schemaVersion: 1, appId, capturedAt, scope: 'public-iphone-storefront-survey', uploadedMasterDimensionsVerified: false,
    rights: { publicReferencePreview: 'unverified', outreachPerformed: false }, requestedStorefronts: storefronts, captures, failures }
  const payload = JSON.stringify(artifact, null, 2) + '\n'
  const file = resolve(input.directory, `capture-${sha256(payload).slice(0, 16)}.json`)
  await writeProjectFile(input.directory, `capture-${sha256(payload).slice(0, 16)}.json`, payload)
  return { file, artifact }
}

export async function importLocalScreenshots(input: { files: string[]; directory: string; language?: string }) {
  if (!input.files.length) throw new Error('source-images-missing')
  const screenshots = []
  for (const [index, path] of input.files.entries()) {
    const { bytes, ...meta } = await readRaster(path)
    const hash = sha256(bytes); const file = `assets/${hash}.${meta.format}`
    await writeProjectFile(input.directory, file, bytes)
    screenshots.push({ index, file, sha256: hash, width: meta.width, height: meta.height, bytes: bytes.length, suppliedFileName: path.split('/').pop() })
  }
  const artifact = { schemaVersion: 1, capturedAt: new Date().toISOString(), scope: 'user-supplied-images', uploadedMasterDimensionsVerified: false,
    rights: { publicReferencePreview: 'unverified', outreachPerformed: false }, requestedStorefronts: [], failures: [],
    captures: [{ storefront: 'us', pageLanguage: null, imageCopyLanguage: input.language ?? null, imageCopyLanguageStatus: input.language ? 'user-declared' : 'requires-visual-review',
      screenshots, setHash: sha256(JSON.stringify(screenshots.map(s => s.sha256))) }] }
  const payload = JSON.stringify(artifact, null, 2) + '\n'
  const file = resolve(input.directory, `capture-${sha256(payload).slice(0, 16)}.json`)
  await writeProjectFile(input.directory, `capture-${sha256(payload).slice(0, 16)}.json`, payload)
  return { file, artifact }
}
