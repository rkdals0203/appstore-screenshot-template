import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, symlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { zipSync } from 'fflate'
import { designDocumentSchema } from '@crescreendo/design-core/document'
import { readProject, saveProject, checkProject, packProject, unpackProject, ProjectConflictError, sha256 } from '../dist/index.js'
import { decodeProjectArchive } from '../dist/project-archive.js'

const directories = []
after(async () => { await Promise.all(directories.map(path => rm(path, { recursive: true, force: true }))) })
async function temp() { const root = await mkdtemp(join(tmpdir(), 'porting-project-')); directories.push(root); return root }
function document() {
  return designDocumentSchema.parse({ schemaVersion: 2, canvas: { width: 1284, height: 2778 },
    frames: [{ type: 'FRAME', id: 'frame-a', index: 0, fills: [{ type: 'SOLID', color: '#abcdef' }], children: [
      { type: 'GROUP', id: 'group', frame: { x: 10, y: 20, width: 1000, height: 2500 }, rotation: 5, children: [
        { type: 'TEXT', id: 'title', frame: { x: 5, y: 6, width: 900, height: 250 }, characters: 'Hello 안녕',
          style: { fontFamily: 'Test Face', fontWeight: 600, fontSize: 80 }, textAutoResize: 'HEIGHT' },
        { type: 'MOCKUP', id: 'screen', frame: { x: 10, y: 400, width: 850, height: 1700 },
          device: { type: 'phone', frameStyle: 'flat' }, screenBinding: { appImageIndex: 0 },
          screenFraming: { focusX: 20, focusY: 70, zoom: 1.2 }, tilt: { rotationX: 5, rotationY: -8 } },
      ] },
    ] }], assets: [{ id: 'screen-a', kind: 'screenshot' }, { id: 'screen-b', kind: 'screenshot' }] })
}
async function fixture(root) {
  root ??= await temp()
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'source'), { recursive: true })
  // These opaque bytes test file registration, NOT font/media decoding or render readiness.
  const files = [
    { id: 'screen-a', kind: 'image', path: 'assets/a.png', value: 'image a bytes' },
    { id: 'screen-b', kind: 'image', path: 'assets/b.png', value: 'image b bytes' },
    { id: 'face', kind: 'font', family: 'Test Face', style: 'normal', weight: [600, 600], path: 'assets/face.ttf', value: 'font bytes' },
  ]
  const resources = []
  for (const { value, ...entry } of files) {
    await writeFile(join(root, entry.path), value)
    resources.push({ ...entry, sha256: sha256(value), bytes: Buffer.byteLength(value) })
  }
  const source = 'immutable source record'
  await writeFile(join(root, 'source/capture.json'), source)
  const spec = { title: 'Editable fixture', resources, screenshots: ['screen-a'], attachments: [
    { path: 'source/capture.json', sha256: sha256(source), bytes: Buffer.byteLength(source) },
  ] }
  const snapshot = await saveProject({ directory: root, expectedRevision: null, document: document(), spec })
  return { root, spec, snapshot }
}

test('edit text, background and app image, move folder, package and reopen without document loss', async () => {
  const { root, snapshot } = await fixture()
  const sourceBefore = await readFile(join(root, 'source/capture.json'))
  const oldDocument = await readFile(join(root, snapshot.manifest.document.path))
  const edited = structuredClone(snapshot.document)
  edited.frames[0].fills[0].color = '#112233'
  const [title, phone] = edited.frames[0].children[0].children
  title.characters = '새 제목 with a new line\nMore'
  phone.screenBinding = { assetRef: 'asset:screen-b' }
  const next = await saveProject({ directory: root, expectedRevision: snapshot.revision, document: edited })
  assert.notEqual(next.revision, snapshot.revision)
  assert.deepEqual((await readProject(root)).document, edited)
  assert.deepEqual(await readFile(join(root, 'document.json')), oldDocument)
  assert.deepEqual(await readFile(join(root, 'source/capture.json')), sourceBefore)
  const parent = await temp(), moved = join(parent, 'moved')
  await rename(root, moved)
  const check = await checkProject(moved)
  assert.equal(check.ok, true, JSON.stringify(check))
  assert.equal(check.checks.fontGlyphs, false)
  assert.equal(check.checks.render, false)
  const zip = join(parent, 'project.zip')
  const packed = await packProject(moved, zip)
  assert.equal(packed.revision, next.revision)
  await unpackProject(zip, join(parent, 'reopened'))
  const reopened = await readProject(join(parent, 'reopened'))
  assert.deepEqual(reopened, next)
  const repacked = await packProject(join(parent, 'reopened'), join(parent, 'again.zip'))
  assert.equal(repacked.sha256, packed.sha256)
})

test('stale revisions and simultaneous writers preserve the winner and immutable source', async () => {
  const { root, snapshot } = await fixture()
  const changed = structuredClone(snapshot.document)
  changed.frames[0].children[0].children[0].characters = 'First writer'
  const results = await Promise.allSettled([1, 2].map(() => saveProject({ directory: root,
    expectedRevision: snapshot.revision, document: changed })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision, document: snapshot.document }), ProjectConflictError)
  assert.deepEqual((await readProject(root)).document, changed)
  assert.equal((await readdir(root)).some(file => file.endsWith('.tmp') || file.endsWith('.lock')), false)
})

test('initialization preserves an already-authored document and a repeated save keeps its revision', async () => {
  const root = await temp(), doc = document(), bytes = JSON.stringify(doc)
  await writeFile(join(root, 'document.json'), bytes)
  const first = await saveProject({ directory: root, expectedRevision: null, document: doc,
    spec: { title: 'Unfinished draft', resources: [] } })
  assert.equal(await readFile(join(root, 'document.json'), 'utf8'), bytes)
  assert.equal((await readProject(root)).manifest.document.sha256, sha256(bytes))
  const next = await saveProject({ directory: root, expectedRevision: first.revision, document: doc })
  const repeated = await saveProject({ directory: root, expectedRevision: next.revision, document: doc })
  assert.equal(repeated.revision, next.revision)
})

test('failure before manifest commit leaves the current project readable', async () => {
  const { root, snapshot } = await fixture()
  await writeFile(join(root, 'documents'), 'cannot create a document directory here')
  const changed = structuredClone(snapshot.document)
  changed.frames[0].fills[0].color = '#123456'
  await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision, document: changed }))
  assert.deepEqual(await readProject(root), snapshot)
  assert.equal((await readdir(root)).some(file => file.endsWith('.lock')), false)
})

test('externally changed manifests and altered document bytes are not overwritten silently', async () => {
  const { root, snapshot } = await fixture()
  const bytes = await readFile(join(root, 'project.json'), 'utf8')
  await writeFile(join(root, 'project.json'), bytes + '\n')
  await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision, document: snapshot.document }), ProjectConflictError)
  await writeFile(join(root, snapshot.manifest.document.path), JSON.stringify({ ...snapshot.document, canvas: { width: 1, height: 1 } }))
  await assert.rejects(readProject(root), /hash-mismatch/)
})

test('check reports missing image/font/model and bad links without treating it as design failure', async () => {
  const { root, spec, snapshot } = await fixture()
  const draft = structuredClone(snapshot.document)
  const children = draft.frames[0].children[0].children
  children[0].style.fontWeight = 700
  children[1].device.frameStyle = 'mockup'
  children[1].screenBinding.appImageIndex = 12
  draft.frames[0].index = 10
  await saveProject({ directory: root, expectedRevision: snapshot.revision, document: draft, spec: { ...spec, resources: spec.resources.filter(item => item.id !== 'screen-b') } })
  const result = await checkProject(root)
  assert.equal(result.ok, false)
  for (const code of ['missing-image', 'missing-font', 'missing-model', 'missing-screenshot', 'invalid-frame-index']) {
    assert.ok(result.issues.some(issue => issue.code === code), code)
  }
  assert.equal(result.checks.visualQuality, false)
  // An unfinished draft may still be transported. Packaging isn't render approval.
  const zip = join(await temp(), 'draft.zip')
  assert.equal((await packProject(root, zip)).check.ok, false)
})

test('file hashes and symlink resources are checked; missing registered bytes prevent packaging', async () => {
  const { root } = await fixture()
  await writeFile(join(root, 'assets/a.png'), 'changed bytes')
  assert.equal((await checkProject(root)).ok, false)
  await assert.rejects(packProject(root, join(await temp(), 'bad.zip')), /hash-mismatch/)
  await rm(join(root, 'assets/a.png'))
  await symlink(join(root, 'source/capture.json'), join(root, 'assets/a.png'))
  const result = await checkProject(root)
  assert.ok(result.issues.some(issue => issue.message.includes('symlink')))
})

test('unsupported contracts and URL-backed documents are preserved rather than converted', async () => {
  const { root, snapshot } = await fixture()
  const doc = structuredClone(snapshot.document)
  doc.assets[0].url = 'https://service.invalid/private?signature=secret'
  await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision, document: doc }), /nonportable-asset/)
  assert.equal((await readProject(root)).revision, snapshot.revision)
  const manifest = JSON.parse(await readFile(join(root, 'project.json'), 'utf8'))
  manifest.compatibility.documentContract = 'unknown-future-contract'
  const bytes = JSON.stringify(manifest)
  await writeFile(join(root, 'project.json'), bytes)
  assert.equal((await checkProject(root)).ok, false)
  assert.equal(await readFile(join(root, 'project.json'), 'utf8'), bytes)
})

test('retired S3a contracts and schemaVersion 1 documents cannot be relabeled into current projects', async () => {
  const { root, snapshot } = await fixture()
  const original = await readFile(join(root, 'project.json'))
  await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision,
    document: { ...snapshot.document, schemaVersion: 1 } }))
  assert.deepEqual(await readFile(join(root, 'project.json')), original)
  const manifest = JSON.parse(original.toString('utf8'))
  manifest.compatibility.documentContract = 'crescreendo.design.s3a-development'
  const retired = Buffer.from(JSON.stringify(manifest))
  await writeFile(join(root, 'project.json'), retired)
  assert.equal((await checkProject(root)).ok, false)
  assert.deepEqual(await readFile(join(root, 'project.json')), retired)
})

test('path traversal, case aliases, unsafe resource mappings and duplicate IDs are rejected', async () => {
  const { root, spec, snapshot } = await fixture()
  for (const path of ['../escape', '/tmp/escape', 'assets/../../escape', 'assets\\escape', 'assets/con.txt', 'assets/a.']) {
    const bad = structuredClone(spec)
    bad.resources[0].path = path
    await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision, document: snapshot.document, spec: bad }))
  }
  for (const field of ['id', 'path']) {
    const bad = structuredClone(spec)
    bad.resources[1][field] = bad.resources[0][field]
    await assert.rejects(saveProject({ directory: root, expectedRevision: snapshot.revision, document: snapshot.document, spec: bad }))
  }
})

test('ZIP extraction rejects traversal, symlinks, huge declared expansion, CRC errors and unregistered data', async () => {
  const one = path => Buffer.from(zipSync({ [path]: new Uint8Array([1, 2, 3]) }))
  for (const path of ['../escape', '/escape', 'assets/../escape', 'assets\\escape']) assert.throws(() => decodeProjectArchive(one(path)))
  const alias = Buffer.from(zipSync({ 'assets/A': new Uint8Array(), 'assets/a': new Uint8Array() }))
  assert.throws(() => decodeProjectArchive(alias), /duplicate/)
  const central = bytes => bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  const symlinkZip = one('assets/a'); symlinkZip.writeUInt32LE(0xa1ff0000, central(symlinkZip) + 38)
  assert.throws(() => decodeProjectArchive(symlinkZip), /symlink/)
  const oversized = one('assets/a'); oversized.writeUInt32LE(0x7fffffff, central(oversized) + 24)
  assert.throws(() => decodeProjectArchive(oversized), /expansion/)
  const brokenCRC = one('assets/a'); brokenCRC.writeUInt32LE(0, central(brokenCRC) + 16)
  assert.throws(() => decodeProjectArchive(brokenCRC), /integrity/)
  const dishonestSize = Buffer.from(zipSync({ 'assets/a': new Uint8Array(100_000) }))
  dishonestSize.writeUInt32LE(1, central(dishonestSize) + 24)
  dishonestSize.writeUInt32LE(1, 22)
  assert.throws(() => decodeProjectArchive(dishonestSize), /expansion|integrity|invalid|unexpected/)
  const { root } = await fixture(), parent = await temp(), zip = join(parent, 'project.zip')
  await packProject(root, zip)
  const files = Object.fromEntries(decodeProjectArchive(await readFile(zip)))
  files['unregistered.txt'] = Buffer.from('unregistered')
  await writeFile(zip, zipSync(files))
  const target = join(parent, 'extracted')
  await assert.rejects(unpackProject(zip, target), /unregistered/)
  assert.deepEqual((await readdir(parent)).sort(), ['project.zip'])
})

test('unpack never replaces an existing directory', async () => {
  const { root } = await fixture(), parent = await temp(), zip = join(parent, 'project.zip')
  await packProject(root, zip)
  const target = join(parent, 'existing')
  await mkdir(target)
  await assert.rejects(unpackProject(zip, target), /destination-exists/)
  assert.deepEqual(await readdir(target), [])
})

test('CLI check works without service environment and returns a failing exit code for incomplete drafts', async () => {
  const { root, snapshot } = await fixture()
  const draft = structuredClone(snapshot.document)
  draft.frames[0].children[0].children[0].style.fontFamily = 'Missing Face'
  await saveProject({ directory: root, expectedRevision: snapshot.revision, document: draft })
  const child = spawn(process.execPath, [new URL('../dist/public-cli.js', import.meta.url).pathname, 'check', root], { env: {} })
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
  const code = await new Promise(resolve => child.on('close', resolve))
  assert.equal(code, 2, stderr)
  assert.equal(JSON.parse(stdout).ok, false)
})

test('linked magnifiers validate the source relationship instead of requiring a raster asset', async () => {
  const { root, snapshot } = await fixture()
  const doc = structuredClone(snapshot.document)
  doc.frames[0].children.push({ frame: { x: 20, y: 20, width: 200, height: 100 }, type: 'IMAGE', id: 'magnifier',
    assetRef: 'linked-mockup:screen', presentation: { kind: 'linkedMagnifier', sourceLayerId: 'screen',
      sourceRect: { x: 0, y: 0, width: 0.5, height: 0.5 } } })
  // Parse canonical defaults; this tests a real document relationship, not an app name.
  const parsed = designDocumentSchema.parse(doc)
  const saved = await saveProject({ directory: root, expectedRevision: snapshot.revision, document: parsed })
  assert.equal((await checkProject(root)).ok, true)
  parsed.frames[0].children.at(-1).presentation.sourceLayerId = 'missing-source'
  await saveProject({ directory: root, expectedRevision: saved.revision, document: parsed })
  assert.ok((await checkProject(root)).issues.some(i => i.code === 'invalid-linked-source'))
})
