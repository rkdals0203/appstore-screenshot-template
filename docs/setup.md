# Connect your AI

[README](../README.md)

Choose the plugin or standalone skill, not both. The Cloud service is live at
`https://crescreendo-cloud-mcp.crescreendo-rkdals0203.workers.dev/mcp`.
The GitHub installation commands below install the Cloud preview skill/plugin.
They do not install a local editor.

## Codex plugin

```bash
codex plugin marketplace add rkdals0203/appstore-screenshot-template
codex plugin add appstore-screenshot-template@crescreendo
```

Open the plugin in Codex and use **Connect**. Sign in to Crescreendo and approve the
access you choose. The plugin supplies both the skill and remote server settings;
do not also run `codex mcp add`. Start a new conversation if tools are not loaded.

## Claude Code plugin

```bash
claude plugin marketplace add rkdals0203/appstore-screenshot-template
claude plugin install appstore-screenshot-template@crescreendo --scope user
```

In Claude Code, open `/mcp`, select the plugin's Crescreendo server, and authenticate.
Restart the session if the skill/server is not listed. You can invoke the skill with
`/appstore-screenshot-template:appstore-screenshot-template` or ask in natural language.
Do not also register a standalone Crescreendo server.

## Standalone skill

```bash
npx skills add rkdals0203/appstore-screenshot-template
```

The current `skills` installer requires Node.js 22.20+.

Ask your agent to reconstruct an App Store link. The skill first tries connected
tools. If none work, it runs its bundled `scripts/connect.mjs` for the active host.
The helper checks existing settings and registers only the official server through
the host's CLI. It never overwrites a conflicting server or reads stored credentials.
The agent then starts OAuth if needed. Approve the AI connection yourself in the temporary
editor. The CLI may call this action “login”; a Crescreendo account is not required. A fresh conversation may be needed before the host exposes the new tools.

The skill installer copies files; it does not execute this helper at installation
time. No npm post-install hook edits your configuration. Node.js 20.19+ and the
current host's CLI must be available. You do not need a separate example request.

## Access and first use

The connection modal grants access only to this temporary work. Existing account
connections can still select their apps. A configured server is not proof of authorization:
the agent must successfully call `get_capabilities` before reconstructing.

Give your agent an App Store link. It collects the references, uploads required
resources, creates a draft, and opens the returned editor URL. Keep that tab open
while the AI requests captures and compares the result. There is no sample-project,
local-editor, or browser-download step.

You do not need to open Chrome beforehand. The agent reuses the draft's tab or opens
your browser using the host's tools. A remote/headless AI that cannot open a browser
on your computer instead provides the editor link. Reuse the browser that approved the
connection: the URL alone cannot open the document in another browser. OAuth uses one
callback popup; when blocked, finish in the same tab and reopen the returned editor URL.

**Save to project** asks you to sign in and then choose an existing app, an App Store
result or a manually named app. The document and its edits stay intact. Canceling sign-in
or save keeps the current work open. Crescreendo AI also requires an account and credits.

## Manual recovery

Only use these commands if standalone setup could not run. Do not duplicate an
already installed plugin connection.

```bash
# Codex
codex mcp add crescreendo --url https://crescreendo-cloud-mcp.crescreendo-rkdals0203.workers.dev/mcp
# If add did not already complete sign-in:
codex mcp login crescreendo

# Claude Code
claude mcp add --transport http --scope user crescreendo https://crescreendo-cloud-mcp.crescreendo-rkdals0203.workers.dev/mcp
claude mcp login crescreendo
```

Claude Code also offers `/mcp`; headless terminals can use
`claude mcp login crescreendo --no-browser` and follow the host's callback prompt.
Never paste tokens or cookies into chat.

- Missing CLI/plugin commands: update that host; do not silently switch AI hosts.
- Existing server at another URL, or a disabled entry: review it in host settings.
  Setup refuses to overwrite it. Re-running setup preserves matching entries.
- Missing tools after installation: refresh/restart the AI session. Reinstalling or
  repeatedly logging in does not hot-load tools into every running conversation.
- Expired/revoked access: reconnect through the host's connection controls.
- Upload expiry: repeat `prepare_upload` with the same request ID and exact bytes.
- Edit conflict: read the current revision and reconcile; never force overwrite.
- Waiting for render: open the returned editor URL on the requested document and
  language, and let pending edits save. No server browser runs in the background.
- Failed frames: inspect the diagnostics; missing fonts/models are not substituted.

## Verification and source development

The packaging checks target macOS arm64, Node.js 20.19.6, Codex CLI 0.153.0 and
Claude Code 2.1.284. Standalone installation uses `skills` 1.7.0 on Node.js 24.19.0
(the installer requires 22.20+). Other versions/platforms are not certified by these checks.
GitHub installation was verified in isolated Codex and Claude Code settings on September
30, 2026, including standalone skill discovery. Public source build/tests also pass on
Ubuntu with Node.js 22. This does not certify the complete browser workflow on Linux.
Published-installation checks and earlier authentication evidence are documented separately
in [verification and known limits](release-checklist.md).

Source contributors can run `npm ci`, `npm run build`, and `npm test` with the
included lockfile. The same skill is stored inside the plugin's `skills/` directory;
standalone installers discover it there. No duplicate instruction set is maintained.

Official references: [Codex plugins](https://developers.openai.com/plugins/build/plugins)
· [Codex MCP](https://developers.openai.com/codex/mcp/)
· [Claude Code plugins](https://code.claude.com/docs/en/plugins-reference)
· [Claude Code MCP](https://code.claude.com/docs/en/mcp).

## Reconstruction and AI editing

The skill, plugin, connection, reconstruction, editing with your own AI, manual editing
and watermark-free PNG export are free. Free accounts can save multiple documents under
one app. Pro supports more apps and full history. Your AI provider bills its own usage.

The optional `start_adaptation` tool runs Crescreendo AI on a published template, with
account login and approved Crescreendo AI credits. Guest connections cannot query a wallet
or start that paid task. This integration does not change existing account credit or billing
rules. Always read the service's current capabilities before continuing a paid operation.
