#!/usr/bin/env node
/** Register only the reviewed Crescreendo endpoint through the host's own CLI. */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MCP_URL = 'https://crescreendo-cloud-mcp.crescreendo-rkdals0203.workers.dev/mcp'
export const SERVER = 'crescreendo'
export const PLUGIN = 'appstore-screenshot-template@crescreendo'

export function parseArgs(args) {
  let host, check = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && !host) host = args[++i]
    else if (args[i] === '--check' && !check) check = true
    else throw Error('Usage: node connect.mjs --host codex|claude [--check]')
  }
  if (!['codex', 'claude'].includes(host)) throw Error('Select the current host explicitly: --host codex or --host claude.')
  return { host, check }
}

function jsonResult(result, operation) {
  if (result.status !== 0) throw Error(`${operation} failed. Check the host CLI; no configuration was changed.`)
  try { return JSON.parse(result.stdout) } catch { throw Error(`${operation} returned an unsupported format; no configuration was changed.`) }
}

function execute(host, args, { interactive = false } = {}) {
  const result = spawnSync(host, args, {
    shell: false, encoding: 'utf8',
    stdio: interactive ? 'inherit' : 'pipe',
    ...(interactive ? {} : { timeout: 30_000 }),
  })
  if (result.error) throw Error(`Could not run ${host}. Install/update that host's CLI and retry. No fallback host was selected.`)
  return result
}

export function connect({ host, check = false }, run = execute) {
  const pluginData = jsonResult(run(host, ['plugin', 'list', '--json']), 'Plugin discovery')
  const plugins = host === 'claude' ? pluginData : pluginData.installed
  if (!Array.isArray(plugins)) throw Error('Unsupported plugin inventory; update the host CLI. No configuration was changed.')
  const installed = plugins.find(p => p.id === PLUGIN || p.pluginId === PLUGIN)
  if (installed?.enabled === false) throw Error('The Crescreendo plugin is disabled. Enable it in the host before retrying; no standalone server was added.')
  if (installed) return { status: 'plugin_configured', host, authentication: 'Use the host plugin connection controls to sign in to Crescreendo. Do not add a duplicate standalone server.' }

  let exists = false, name = SERVER
  if (host === 'codex') {
    const servers = jsonResult(run(host, ['mcp', 'list', '--json']), 'MCP discovery')
    if (!Array.isArray(servers)) throw Error('Unsupported MCP inventory; no configuration was changed.')
    const named = servers.find(s => s.name === SERVER)
    const matching = servers.find(s => s.transport?.url === MCP_URL && s.enabled !== false)
    const server = named ?? matching
    if (server) {
      if (server.transport?.url !== MCP_URL || server.transport?.type !== 'streamable_http' || server.enabled === false) {
        throw Error('The crescreendo server has a different endpoint, transport, or is disabled. Review it in Codex settings; this helper will not overwrite it.')
      }
      exists = true; name = server.name
    }
  } else {
    const result = run(host, ['mcp', 'get', SERVER])
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    if (result.status === 0) {
      const url = output.match(/^\s*URL:\s*(\S+)\s*$/m)?.[1]
      if (url !== MCP_URL || !/^\s*Type:\s*http\s*$/m.test(output)) {
        throw Error('The crescreendo server has a different endpoint or transport. Review it in Claude Code; this helper will not overwrite it.')
      }
      exists = true
    } else if (!/^No MCP server named ["']crescreendo["']/m.test(output.trim())) {
      throw Error('MCP discovery failed. Check Claude Code before retrying; no configuration was changed.')
    }
  }

  if (!exists && !check) {
    const args = host === 'codex'
      ? ['mcp', 'add', SERVER, '--url', MCP_URL]
      : ['mcp', 'add', '--transport', 'http', '--scope', 'user', SERVER, MCP_URL]
    // Codex may launch OAuth as part of add; pass terminal input through to the host.
    if (run(host, args, { interactive: true }).status !== 0) {
      throw Error('Host setup did not finish. It may have saved the entry before authentication failed; run --check before retrying. No entry was removed.')
    }
  }
  return {
    status: exists ? 'already_configured' : check ? 'missing' : 'configured', host, server: name, url: MCP_URL,
    authentication: 'Configuration is not authentication. If add already completed sign-in, do not log in again. Otherwise run the login command below.',
    loginCommand: [host, 'mcp', 'login', name],
    next: 'Refresh/restart the AI session if tools are missing, then call get_capabilities before reconstructing.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { console.log(JSON.stringify(connect(parseArgs(process.argv.slice(2))), null, 2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
