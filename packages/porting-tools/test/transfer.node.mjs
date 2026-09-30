import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { packProject, unpackProject, checkProject, readProject } from '../dist/index.js'
import { prepareProjectTransfer, readProjectArchive, encodeProjectArchive, jsonBytes, hashBytes } from '../dist/project-transfer.js'

const sample = new URL('../examples/local-edit/', import.meta.url).pathname
test('Cloud bundle excludes source attachments and returns a portable edited document', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'porting-transfer-'))
  const original = join(directory, 'original.zip')
  await packProject(sample, original)
  const prepared = await prepareProjectTransfer(await readFile(original))
  const snapshot = await readProjectArchive(prepared)
  assert.equal(snapshot.manifest.attachments.length, 0)
  assert.equal([...snapshot.files.keys()].some(path => path.startsWith('source/')), false)
  const before = await readProject(sample)
  assert.deepEqual(snapshot.document, before.document)
  snapshot.document.frames[0].fills = [{ type: 'SOLID', color: '#123456', opacity: 1 }]
  snapshot.document.frames[0].children.find(layer => layer.type === 'TEXT').characters = 'Edited in Cloud'
  const bytes = jsonBytes(snapshot.document)
  snapshot.manifest.document = { path: 'document.json', bytes: bytes.length, sha256: await hashBytes(bytes) }
  snapshot.files.set('document.json', bytes)
  const archive = encodeProjectArchive(snapshot.manifest, snapshot.files)
  const reopened = await readProjectArchive(archive)
  assert.deepEqual(reopened.document, snapshot.document)
  assert.equal((await readProject(sample)).revision, before.revision)
})
test('tampered bytes, unsafe paths and unregistered archive entries fail before transfer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'porting-transfer-invalid-'))
  const original = join(directory, 'original.zip'); await packProject(sample, original)
  const snapshot = await readProjectArchive(await readFile(original))
  const files = Object.fromEntries(snapshot.files)
  files[snapshot.manifest.resources[0].path] = new Uint8Array([1, 2, 3])
  await assert.rejects(readProjectArchive(zipSync(files)), /project-file-integrity/)
  await assert.rejects(readProjectArchive(zipSync({ '../escape': new Uint8Array() })), /path-invalid/)
  await assert.rejects(readProjectArchive(zipSync({ ...Object.fromEntries(snapshot.files), '.porting-session.json': new Uint8Array() })), /unregistered-file/)
})
