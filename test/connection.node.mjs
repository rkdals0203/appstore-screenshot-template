import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const sourceSkill = new URL('../skill/scripts/connect.mjs', import.meta.url)
const helper = existsSync(sourceSkill) ? sourceSkill : new URL('../plugins/appstore-screenshot-template/skills/appstore-screenshot-template/scripts/connect.mjs', import.meta.url)
const { connect, parseArgs, MCP_URL, PLUGIN } = await import(helper.href)
const root = existsSync(sourceSkill) ? new URL('../public-repository/', import.meta.url) : new URL('../', import.meta.url)
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const ok = value => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' })
const absent = { status: 1, stdout: '', stderr: 'No MCP server named "crescreendo". Run `claude mcp add` to add one.' }
function mock(host, inventory, responses = []) {
  const calls = []
  return {
    calls,
    run: (command, args, options) => {
      assert.equal(command, host)
      calls.push({ args, options })
      if (args[0] === 'plugin') return ok(host === 'codex' ? { installed: inventory } : inventory)
      assert.ok(responses.length, `Unexpected call: ${args.join(' ')}`)
      return responses.shift()
    },
  }
}
const server = { name: 'crescreendo', enabled: true, transport: { type: 'streamable_http', url: MCP_URL } }

test('both plugins, marketplaces and standalone metadata use the same endpoint and identity', () => {
  const pluginPath = 'plugins/appstore-screenshot-template/'
  for (const host of ['codex', 'claude']) {
    const p = json(`${pluginPath}.${host}-plugin/plugin.json`)
    assert.equal(p.name, 'appstore-screenshot-template')
    assert.equal(p.version, '0.1.0')
    assert.equal(p.license, 'MIT')
  }
  assert.deepEqual(json(`${pluginPath}.mcp.json`), { mcpServers: { crescreendo: { type: 'http', url: MCP_URL } } })
  const codex = json('.agents/plugins/marketplace.json')
  const claude = json('.claude-plugin/marketplace.json')
  assert.equal(codex.name, 'crescreendo'); assert.equal(claude.name, codex.name)
  assert.equal(codex.plugins[0].source.path, './plugins/appstore-screenshot-template')
  assert.equal(claude.plugins[0].source, codex.plugins[0].source.path)
  assert.match(readFileSync(new URL('../agents/openai.yaml', helper), 'utf8'), new RegExp(MCP_URL.replaceAll('.', '\\.')))
})

test('requires the active host explicitly and rejects unsupported arguments', () => {
  assert.deepEqual(parseArgs(['--host', 'codex', '--check']), { host: 'codex', check: true })
  for (const args of [[], ['--host', 'cursor'], ['--host', 'codex', '--url', 'https://other.example'], ['--host', 'claude', '--force']]) assert.throws(() => parseArgs(args))
})

for (const host of ['codex', 'claude']) {
  test(`${host}: read-only check never registers or authenticates`, () => {
    const m = mock(host, [], [host === 'codex' ? ok([]) : absent])
    assert.equal(connect({ host, check: true }, m.run).status, 'missing')
    assert.equal(m.calls.length, 2)
  })
  test(`${host}: creates only the scoped server with exact CLI arguments`, () => {
    const m = mock(host, [], [host === 'codex' ? ok([]) : absent, ok('')])
    assert.equal(connect({ host }, m.run).status, 'configured')
    assert.deepEqual(m.calls[2].args, host === 'codex' ? ['mcp', 'add', 'crescreendo', '--url', MCP_URL] : ['mcp', 'add', '--transport', 'http', '--scope', 'user', 'crescreendo', MCP_URL])
    assert.deepEqual(m.calls[2].options, { interactive: true })
  })
  test(`${host}: preserves an existing matching server`, () => {
    const m = mock(host, [], [host === 'codex' ? ok([server]) : ok(`crescreendo:\n Scope: User config\n Type: http\n URL: ${MCP_URL}\n`)])
    assert.equal(connect({ host }, m.run).status, 'already_configured')
    assert.equal(m.calls.length, 2)
  })
  test(`${host}: refuses endpoint conflicts and discovery failures`, () => {
    const conflict = host === 'codex' ? ok([{ ...server, transport: { type: 'streamable_http', url: 'https://other.example/mcp' } }]) : ok('Type: http\nURL: https://other.example/mcp')
    for (const response of [conflict, { status: 1, stderr: 'Permission denied' }]) {
      const m = mock(host, [], [response]); assert.throws(() => connect({ host }, m.run)); assert.equal(m.calls.length, 2)
    }
  })
  test(`${host}: reuses its plugin and never creates a duplicate server`, () => {
    const m = mock(host, [{ [host === 'codex' ? 'pluginId' : 'id']: PLUGIN, enabled: true }])
    assert.equal(connect({ host }, m.run).status, 'plugin_configured')
    assert.equal(m.calls.length, 1)
  })
  test(`${host}: does not bypass a disabled plugin with a standalone connection`, () => {
    const m = mock(host, [{ [host === 'codex' ? 'pluginId' : 'id']: PLUGIN, enabled: false }])
    assert.throws(() => connect({ host }, m.run), /disabled/)
    assert.equal(m.calls.length, 1)
  })
  test(`${host}: failed or interrupted setup never removes a possibly saved entry`, () => {
    const m = mock(host, [], [host === 'codex' ? ok([]) : absent, { status: null }])
    assert.throws(() => connect({ host }, m.run), /--check/)
    assert.equal(m.calls.length, 3)
  })
}

test('Codex preserves aliases, unrelated servers and disabled entries', () => {
  const m = mock('codex', [], [ok([{ name: 'unrelated' }, { ...server, name: 'my-crescreendo' }])])
  const result = connect({ host: 'codex' }, m.run)
  assert.equal(result.server, 'my-crescreendo')
  assert.deepEqual(result.loginCommand, ['codex', 'mcp', 'login', 'my-crescreendo'])
  const disabled = mock('codex', [], [ok([{ ...server, enabled: false }])])
  assert.throws(() => connect({ host: 'codex' }, disabled.run), /disabled/)
})

test('unsupported inventories stop before mutation and do not echo their contents', () => {
  for (const host of ['codex', 'claude']) {
    const secret = 'SENSITIVE_OUTPUT_MUST_NOT_BE_ECHOED'
    for (const response of [{ status: 1, stderr: secret }, ok(secret), ok({ unknown: [] })]) {
      let count = 0
      assert.throws(() => connect({ host }, () => { count++; return response }), e => !e.message.includes(secret))
      assert.equal(count, 1)
    }
  }
})
