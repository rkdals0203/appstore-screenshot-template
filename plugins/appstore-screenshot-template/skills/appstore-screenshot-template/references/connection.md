# First-use connection

Production MCP: `https://crescreendo-cloud-mcp.crescreendo-rkdals0203.workers.dev/mcp`

Use existing connected tools first. Both the Codex and Claude Code plugins include
this server and this skill. The standalone skill includes a Node.js setup helper;
the skill installer itself does not execute it. Do not install both paths by default.

## Prepare the current host

Run the bundled helper from its actual installed directory, quoting that path:

```text
node <skill-directory>/scripts/connect.mjs --host codex
node <skill-directory>/scripts/connect.mjs --host claude
```

Use only the line for the active host. Node.js 20.19+ and that host's CLI are required.
`--check` inspects without adding a server or initiating login. Do not download a
different AI host automatically. If the host cannot execute local commands, guide the
user through that host's MCP settings using the official URL above.

The helper uses host CLI commands with argument arrays, not shell text. It never
handles access tokens, replaces a conflicting server, removes entries, or changes
unrelated settings. Standalone registration is user-scoped. An existing enabled
Crescreendo plugin is reused. A disabled plugin remains disabled.

## Authenticate and load tools

- `configured`: Codex's `mcp add` may already have completed OAuth. If it did, do not
  request another login. Otherwise execute the returned `loginCommand` as an argument
  array in a terminal the user can interact with. Claude Code also offers `/mcp`.
- `already_configured`: reuse it. If tools report authentication required, execute
  the returned login command. If tools are just absent in the current conversation,
  refresh/restart that session before creating another connection.
- `plugin_configured`: use the plugin's Connect action in Codex, or Claude Code's
  `/mcp` menu and its plugin-provided Crescreendo entry. Do not add a standalone server.
- `missing` from `--check`: run again without `--check` to register it.
- A conflicting/disabled standalone entry or an unreadable inventory is a blocker.
  Explain the issue instead of removing or overwriting it.

The browser sign-in and access approval belong to the user. Allowing new drafts is
enough for reconstruction; existing apps need not be selected. Approval is not implied
by installing the skill. Never paste session cookies, bearer tokens, or callback codes
into conversation. Do not inspect the host credential store.

Confirm `get_capabilities` actually succeeds before collecting and reconstructing a
large set. If a host needs a new conversation, preserve the requested App Store URL
in your handoff. Do not describe settings registration as a successful tool call.

An editor opens only after `create_draft` returns its URL. Reuse/open it through the
host browser tools, then request rendering. Plugin installation does not open an empty
editor, download Chromium, or install an editor runtime.
