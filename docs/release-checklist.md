# Cloud editor verification

This distribution uses the hosted Crescreendo editor and remote MCP. It contains
no editor binary, Chromium installer, or prior local-editor Git history. Public code
is MIT licensed; the hosted service is separate.

## Earlier account-based release evidence

- Production MCP metadata, owner-scoped drafts and authorization checks.
- Codex OAuth and actual MCP protocol calls, browser rendering, AI revision updates,
  manual edits, reload and watermark-free PNGs. No model call was needed for these checks.
- Claude Code login and connection discovery. This is not a claim that a Claude model
  completed a reconstruction during the protocol test.
- Development Save to project, contribution-copy isolation, revision conflicts,
  app/history entitlements, and the then-planned Free/Pro AI boundary. The guest candidate
  does not enable that AI restriction.
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

The public source checks run a clean installation, build and test suite on Ubuntu with
Node.js 22. See the [CI history](https://github.com/rkdals0203/appstore-screenshot-template/actions/workflows/ci.yml).
Example attachments retain their registered original bytes; checks verify their hashes.

Version 0.1.1 updates the shared adaptation guidance, native object and image-plane
instructions, and the optional credit-funded Crescreendo AI workflow. The public skill
uses the service's reported capabilities and access rules. Create's experimental
reference-image generator remains restricted to Development verification accounts;
this release does not enable it for ordinary users or claim a new reconstruction
quality benchmark. Earlier host login checks are retained above rather than presented
as new checks for this patch.

## Known limits

Packaging checks target macOS arm64, Codex 0.153.0 and Claude Code 2.1.284.
Local source tools support Node.js 20.19+; the tested standalone `skills` installer
requires Node.js 22.20+. Other platforms have not been certified.

The editor tab must remain open with its guest or account session for renders. The host may require a
new conversation after installation. OAuth renewal and reconnect behavior depends on
that host; the connection helper is not an authentication bypass.

These checks validate the editing and transfer workflow, not faithful reconstruction
of every App Store design. Image quality is reviewed separately. The full user journey
is covered by separate protocol, Development UI and packaging checks, not a claim of a
single automated end-to-end run through each published AI host.

## Version 0.1.2 — guest cloud editing

Verified against `https://crescreendo.com` and the production MCP:

- Actual Codex and Claude Code OAuth, guest document creation and revision updates.
- Browser rendering and watermark-free PNG downloads with the editor open.
- Manual text editing, Google sign-in when saving, transfer into an existing app,
  and reopening the same document. The document ID and saved revision are retained.
- The transferred connection retains access to that document only. URL-only and
  unrelated guest requests are rejected.
- Development also covers a newly registered QA account, App Store lookup,
  creating its first app, saving and reopening. This is not an automated test of
  creating a new identity at Google.
- Popup cancellation and blocking, stale revisions, IME/unsaved-edit barriers,
  expiry and transfer races have focused automated coverage. Not every permutation
  was manually repeated in both hosts.

Host tests use deterministic fixture documents. Codex protocol calls require no model
turn, and the Claude Code test replaces model responses with a local fixture while
using real OAuth, MCP, database and browser operations. These checks incur no paid
model calls and do not establish a new reconstruction quality benchmark.

An unchanged AI revision must not trigger a duplicate browser autosave. That regression
is covered alongside ordinary document and contract autosave tests.

Reconstruction, editing with the user's AI, manual editing and PNG export need no account.
Saving and optional Crescreendo AI require sign-in. User AI editing has no Pro gate.
Payment activation and account credit policies are separate from this integration.

## Version 0.1.3 — scoped adaptation corrections

The shared adaptation instructions distinguish model-authored content from host-owned identity and describe scoped correction operations. Guest cloud editing and MCP connection behavior are unchanged. This guidance update does not certify Create generation quality, enable its restricted verification path for general users, or distribute the private generator, editor, model responses, or billing verification tools.
