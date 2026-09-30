import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { uploadCloudResource } from '../dist/cloud-upload.js'

async function fixture(t, handler) {
  const directory = await mkdtemp(join(tmpdir(), 'cloud-upload-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const bytes = Buffer.from('a verified binary, split across parts')
  await writeFile(join(directory, 'image.png'), bytes)
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const uploadId = randomUUID()
  return { directory, origin, bytes, prepared: {
    uploadId, url: `${origin}/api/cloud/uploads/${uploadId}`, ticket: 'test-only-ticket', partBytes: 10,
    expiresAt: Date.now() + 60000,
    resource: { id: 'image', kind: 'image', path: 'image.png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  } }
}
test('uploads the verified file in order without exposing a credential in the result', async t => {
  const parts = []
  const f = await fixture(t, async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-only-ticket')
    assert.equal(new URL(req.url, 'http://local').searchParams.get('part'), String(parts.length))
    const buffers = []; for await (const chunk of req) buffers.push(chunk)
    parts.push(Buffer.concat(buffers)); res.end('{}')
  })
  const result = await uploadCloudResource({ ...f, appOrigin: f.origin })
  assert.deepEqual(Buffer.concat(parts), f.bytes)
  assert.equal(result.next, 'finalize_upload')
  assert.equal(JSON.stringify(result).includes(f.prepared.ticket), false)
})
test('rejects a different destination and altered content before sending bytes', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => { calls++; res.end('{}') })
  await assert.rejects(uploadCloudResource({ ...f, appOrigin: 'https://other.example' }), /destination-mismatch/)
  await writeFile(join(f.directory, 'image.png'), 'changed')
  await assert.rejects(uploadCloudResource({ ...f, appOrigin: f.origin }))
  assert.equal(calls, 0)
})
test('does not follow redirects or silently refresh an expired ticket', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => { calls++; res.writeHead(307, { location: '/elsewhere' }); res.end() })
  await assert.rejects(uploadCloudResource({ ...f, appOrigin: f.origin }), /fetch failed/)
  assert.equal(calls, 1)
  await assert.rejects(uploadCloudResource({ ...f, appOrigin: f.origin, prepared: { ...f.prepared, expiresAt: 0 } }), /ticket-expired/)
  assert.equal(calls, 1)
})
test('cancellation and rejected parts stop the transfer', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => { calls++; res.writeHead(401); res.end() })
  await assert.rejects(uploadCloudResource({ ...f, appOrigin: f.origin, signal: AbortSignal.abort() }))
  assert.equal(calls, 0)
  await assert.rejects(uploadCloudResource({ ...f, appOrigin: f.origin }), /upload-part-failed:401/)
  assert.equal(calls, 1)
})
