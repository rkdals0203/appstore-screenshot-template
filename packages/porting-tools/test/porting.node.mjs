import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rename, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { captureAppStoreSource, importLocalScreenshots, parseAppStoreScreenshots, appSourceIdentity,
  compareImages, registerImageAsset, readProjectFile, sha256 } from '../dist/index.js'
import { writeProjectFile } from '../dist/files.js'

const roots = []
after(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))) })
async function temp() { const root = await mkdtemp(join(tmpdir(), 'portable-porting-')); roots.push(root); return root }
const png = (width = 2, height = 3, colour = '#112233') => sharp({ create: { width, height, channels: 4, background: colour } }).png().toBuffer()
const page = (region, count, ambiguous = false) => `<script id="serialized-server-data">${JSON.stringify({ data: [{
  intent: { id: '123', storefront: region, language: 'en' }, data: { shelfMapping: {
    product_media_phone_main: { items: Array.from({ length: count }, (_, i) => ({ screenshot: {
      template: `https://is1-ssl.mzstatic.com/img${i}/{w}x{h}.{f}`, width: 2, height: 3,
    } })) }, ...(ambiguous ? { product_media_phone_other: { items: [] } } : {}),
  } },
}] })}</script>`

test('URL region is the default; preserve the complete ordered set and page evidence', async () => {
  const directory = await temp(), image = await png(), urls = []
  const result = await captureAppStoreSource({ app: 'https://apps.apple.com/kr/app/example/id123', directory,
    fetchImpl: async url => {
      urls.push(String(url))
      return new Response(String(url).includes('apps.apple.com') ? page('kr', 11) : image)
    } })
  assert.deepEqual(result.artifact.requestedStorefronts, ['kr'])
  assert.equal(result.artifact.failures.length, 0)
  const captured = result.artifact.captures[0]
  assert.deepEqual(captured.screenshots.map(s => s.index), Array.from({ length: 11 }, (_, i) => i))
  assert.equal(captured.imageCopyLanguage, null)
  assert.equal(captured.pageLanguage, 'en')
  assert.equal((await readProjectFile(directory, captured.pageFile, captured.pageSha256)).toString(), page('kr', 11))
  assert.equal(urls.filter(url => url.includes('apps.apple.com')).length, 1)
})

test('partial capture and ambiguous shelves remain explicit failures', async () => {
  const directory = await temp(), image = await png()
  const result = await captureAppStoreSource({ app: '123', directory, storefronts: ['us', 'kr'],
    fetchImpl: async url => new Response(String(url).includes('/kr/') ? 'unavailable'
      : String(url).includes('apps.apple.com') ? page('us', 1) : image,
      { status: String(url).includes('/kr/') ? 503 : 200 }) })
  assert.equal(result.artifact.captures.length, 1)
  assert.equal(result.artifact.failures[0].storefront, 'kr')
  assert.throws(() => parseAppStoreScreenshots(page('us', 1, true), '123', 'us'), /ambiguous/)
  assert.equal(parseAppStoreScreenshots(page('us', 1, true), '123', 'us', 'product_media_phone_main').screenshots.length, 1)
})

test('mixed phone media preserves screenshot order and records previews without fetching them', async () => {
  const data = JSON.parse(page('kr', 3).match(/<script[^>]*>([\s\S]*)<\/script>/)[1])
  const items = data.data[0].data.shelfMapping.product_media_phone_main.items
  const video = { video: { videoUrl: 'https://apptrailers.itunes.apple.com/preview.m3u8' } }
  items.splice(0, 0, video); items.splice(3, 0, video)
  const html = `<script id="serialized-server-data">${JSON.stringify(data)}</script>`
  const urls = [], image = await png()
  const result = await captureAppStoreSource({ app: 'https://apps.apple.com/kr/app/id123', directory: await temp(),
    fetchImpl: async url => { urls.push(String(url)); return new Response(String(url).includes('apps.apple.com') ? html : image) } })
  assert.deepEqual(result.artifact.failures, [])
  const captured = result.artifact.captures[0]
  assert.deepEqual(captured.screenshots.map(s => s.index), [0, 1, 2])
  assert.deepEqual(captured.screenshots.map(s => s.mediaIndex), [1, 2, 4])
  assert.deepEqual(captured.skippedPreviews.map(v => v.mediaIndex), [0, 3])
  assert.ok(urls.every(url => !url.includes('apptrailers')))
  for (const bad of [{}, { video: {} }, { screenshot: {} }, { ...video, screenshot: {} }]) {
    data.data[0].data.shelfMapping.product_media_phone_main.items = [items[1], bad]
    assert.throws(() => parseAppStoreScreenshots(`<script id="serialized-server-data">${JSON.stringify(data)}</script>`, '123', 'kr'))
  }
  data.data[0].data.shelfMapping.product_media_phone_main.items = [video]
  assert.throws(() => parseAppStoreScreenshots(`<script id="serialized-server-data">${JSON.stringify(data)}</script>`, '123', 'kr'), /phone-screenshots-missing/)
})

test('reject unrelated URLs and redirects without following them', async () => {
  for (const url of ['https://apps.apple.com.evil/kr/app/id123', 'http://apps.apple.com/kr/app/id123', 'https://user:password@apps.apple.com/kr/app/id123']) {
    assert.throws(() => appSourceIdentity(url))
  }
  for (const location of ['/kr/app/id123', '/us/app/id456', 'https://example.com']) {
    let requests = 0
    const result = await captureAppStoreSource({ app: '123', directory: await temp(), fetchImpl: async () => {
      requests++; return new Response(null, { status: 302, headers: { location } })
    } })
    assert.equal(requests, 1)
    assert.equal(result.artifact.captures.length, 0)
    assert.equal(result.artifact.failures.length, 1)
  }
})

test('capture reuses checked cached bytes but refuses a poisoned asset directory', async () => {
  const directory = await temp(), image = await png()
  let downloads = 0
  const fetchImpl = async url => {
    if (String(url).includes('apps.apple.com')) return new Response(page('us', 1))
    downloads++; return new Response(image)
  }
  await captureAppStoreSource({ app: '123', directory, fetchImpl })
  await captureAppStoreSource({ app: '123', directory, fetchImpl })
  assert.equal(downloads, 1)
  const poisoned = await temp(), outside = await temp()
  await symlink(outside, join(poisoned, 'assets'))
  const result = await captureAppStoreSource({ app: '123', directory: poisoned, fetchImpl })
  assert.equal(result.artifact.captures.length, 0)
  assert.match(result.artifact.failures[0].error, /symlink/)
})

test('import preserves bytes and order after the whole project moves', async () => {
  const root = await temp(), project = join(root, 'before')
  const images = [await png(), await png(4, 5, '#abcdef')]
  const files = await Promise.all(images.map(async (bytes, i) => { const file = join(root, `${i}.png`); await writeFile(file, bytes); return file }))
  const result = await importLocalScreenshots({ files: files.toReversed(), directory: join(project, 'source'), language: 'ko' })
  const shots = result.artifact.captures[0].screenshots
  assert.deepEqual(shots.map(s => s.sha256), images.toReversed().map(sha256))
  const moved = join(root, 'after'); await rename(project, moved)
  for (const shot of shots) assert.equal(sha256(await readProjectFile(join(moved, 'source'), shot.file, shot.sha256)), shot.sha256)
  assert.equal(result.artifact.captures[0].imageCopyLanguageStatus, 'user-declared')
})

test('host image output has checked references, explicit provenance and immutable revisions', async () => {
  const root = await temp(), source = await png(), image = await png(3, 4)
  await writeProjectFile(root, 'source/original.png', source)
  const file = join(root, 'host-output.png'); await writeFile(file, image)
  const spec = { id: 'hero-art', method: 'outpainted', description: 'Test-only reconstruction record', tool: 'test fixture, no model called',
    inferredContent: 'Pixels outside the original boundary are synthesized', sources: [{ file: 'source/original.png', sha256: sha256(source) }] }
  const first = await registerImageAsset({ directory: root, file, spec })
  assert.equal(first.artifact.visualReview, 'not-reviewed')
  assert.equal(first.artifact.provenance, 'operator-supplied')
  assert.equal(first.artifact.sha256, sha256(image))
  assert.equal((await registerImageAsset({ directory: root, file, spec })).record, first.record)
  await writeFile(file, await png(3, 4, '#ffffff'))
  const second = await registerImageAsset({ directory: root, file, spec })
  assert.equal(second.artifact.id, first.artifact.id)
  assert.notEqual(second.record, first.record)
  assert.equal(sha256(await readProjectFile(root, first.artifact.file)), first.artifact.sha256)
  await writeFile(join(root, 'source/original.png'), 'changed')
  await assert.rejects(registerImageAsset({ directory: root, file, spec }), /hash-mismatch/)
})

test('derived output cannot omit source or invent completed visual review', async () => {
  const root = await temp()
  await assert.rejects(registerImageAsset({ directory: root, file: 'unused', spec: {
    id: 'a', method: 'generated', description: 'test', sources: [], visualReview: 'accepted',
  } }))
})

test('project reads and writes reject traversal, symlinks, hash mismatches and overwrite', async () => {
  const root = await temp(), outside = await temp()
  await writeProjectFile(root, 'assets/valid', 'original')
  await writeProjectFile(root, 'assets/valid', 'original')
  await assert.rejects(writeProjectFile(root, 'assets/valid', 'replacement'), /existing-file-differs/)
  await assert.rejects(readProjectFile(root, 'assets/valid', 'a'.repeat(64)), /hash-mismatch/)
  for (const path of ['../outside', '/absolute', 'assets/../x', 'assets\\x', 'https://example.com/x']) {
    await assert.rejects(readProjectFile(root, path), /path-invalid/)
    await assert.rejects(writeProjectFile(root, path, 'x'), /path-invalid/)
  }
  await symlink(outside, join(root, 'escape'))
  await assert.rejects(writeProjectFile(root, 'escape/new', 'x'), /symlink/)
  await symlink(join(root, 'assets/valid'), join(root, 'link'))
  await assert.rejects(readProjectFile(root, 'link'), /symlink/)
})

test('compare retains actual inputs, rejects size changes, and never issues fidelity approval', async () => {
  const root = await temp(), file = join(root, 'source.png'), other = join(root, 'render.png')
  await writeFile(file, await png()); await writeFile(other, await png(2, 3, '#ffffff'))
  const result = await compareImages({ source: file, rendered: other, directory: join(root, 'review') })
  assert.equal(result.artifact.comparison.changed, 6)
  assert.equal(result.artifact.comparison.interpretation, 'diagnostic-not-fidelity-approval')
  const before = await readFile(other)
  await writeFile(other, await png(3, 2))
  assert.deepEqual(await readProjectFile(join(root, 'review'), result.artifact.rendered.file), before)
  await assert.rejects(compareImages({ source: file, rendered: other, directory: join(root, 'review') }), /dimensions-differ/)
  await assert.rejects(compareImages({ source: file, rendered: file, directory: root,
    exclusions: [{ x: 0, y: 0, width: 2, height: 3 }] }), /all-pixels-excluded/)
})

test('built CLI executes outside the repository without a service environment', async () => {
  const root = await temp(), file = join(root, 'source.png')
  await writeFile(file, await png())
  const cli = fileURLToPath(new URL('../dist/public-cli.js', import.meta.url))
  const run = (...args) => promisify(execFile)(process.execPath, [cli, ...args], { cwd: root, env: { PATH: process.env.PATH } })
  const result = JSON.parse((await run('files', 'my project', file)).stdout)
  assert.equal(result.artifact.captures[0].screenshots.length, 1)
  const compared = JSON.parse((await run('compare', file, file, 'review')).stdout)
  assert.equal(compared.artifact.comparison.changed, 0)
  const help = await run('--help'); assert.match(help.stdout, /upload <workspace>/)
  assert.doesNotMatch(help.stdout, /^  (?:open|render|library|status|edit) /m)
  await assert.rejects(run('capture', '123', 'project', '--unknown'), error => error.code === 1)
  await assert.rejects(run('render', 'document.json'), error => error.code === 1)
})
