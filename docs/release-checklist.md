# Cloud preview verification

Version `0.1.0` uses the hosted Crescreendo editor and remote MCP. It contains
no editor binary, Chromium installer, or prior local-editor Git history. Public code
is MIT licensed; the hosted service is separate.

## Verified before publication

- Production MCP metadata, owner-scoped drafts and authorization checks.
- Codex OAuth and actual MCP protocol calls, browser rendering, AI revision updates,
  manual edits, reload and watermark-free PNGs. No model call was needed for these checks.
- Claude Code login and connection discovery. This is not a claim that a Claude model
  completed a reconstruction during the protocol test.
- Development Save to project, contribution-copy isolation, revision conflicts,
  app/history entitlements, and the planned Free/Pro AI boundary.
- Local Codex and Claude Code plugin installation: one skill, one remote MCP server.
  Standalone skill discovery, setup reuse and refusal to overwrite conflicting settings.
- Public source builds and tests outside the private repository, with no service
  credentials. The upload helper validates destinations and exact resource bytes.
- Reviewed README captures, source provenance, a pinned lockfile and authored examples.

## Publication checks

- [x] Explicit approval to create the clean repository and publish English commits.
- [x] Install the published GitHub plugin through both supported hosts in isolated settings.
- [x] Install the standalone skill from the published repository.
- [x] Verify the published tree, source builds and release contain no private runtime or secrets.

On September 30, 2026, both hosts installed this plugin from the public GitHub repository
in isolated settings. Each exposed one skill and one production MCP connection. The
standalone skills installer also installed the same skill and setup helper for Codex and
Claude Code. No normal host settings or existing OAuth grants were changed. This checks
published installation; fresh login was not repeated as part of that installation test.

The source is verified with a clean install, build and all 51 tests. The
[public source checks](https://github.com/rkdals0203/appstore-screenshot-template/actions/workflows/ci.yml)
run on Ubuntu with Node.js 22. Example attachments retain their registered original
bytes, and project checks validate their hashes.

## Known limits

Packaging checks target macOS arm64, Codex 0.153.0 and Claude Code 2.1.284.
Local source tools support Node.js 20.19+; the tested standalone `skills` installer
requires Node.js 22.20+. Other platforms have not been certified.

The editor tab must remain open and authenticated for renders. The host may require a
new conversation after installation. OAuth renewal and reconnect behavior depends on
that host; the connection helper is not an authentication bypass.

These checks validate the editing and transfer workflow, not faithful reconstruction
of every App Store design. Image quality is reviewed separately. The full user journey
is covered by separate protocol, Development UI and packaging checks, not a claim of a
single automated end-to-end run through each published AI host.

## Current and planned access

Reconstruction, manual editing, one saved app and watermark-free PNG export are free.
New Pro purchases and the Pro AI-editing restriction are currently disabled. The service
reports the current policy and allowed actions through `aiAccess`.

When the Pro policy launches, original corrections remain free until the owner confirms
reconstruction. AI adaptation, continued AI editing and AI language variants will require
Pro; manual edits and export remain free. Provider usage is billed by the user's AI
provider. Payment activation and its remaining integration checks are separate from this
Cloud preview release.
