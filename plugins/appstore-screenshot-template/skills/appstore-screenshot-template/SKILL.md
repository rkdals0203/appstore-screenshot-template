---
name: appstore-screenshot-template
license: MIT
description: Reconstruct an App Store screenshot set as an editable document, preserve original source order and design, extract or restore image assets, and compare actual renders. Use for App Store URL reconstruction, fidelity diagnosis, or adapting and editing an existing Crescreendo document with the user’s AI, subject to its server-reported access.
---

# App Store Screenshot Template

The skill reconstructs editable documents with the user's AI and opens them in the
Crescreendo cloud editor. The AI does not confirm reconstruction, choose a permanent app, or submit contribution
consent. Image work uses the host's actual image tools.

## Connect before reconstructing

First call the available Crescreendo `get_capabilities` tool (its name may have a plugin
prefix). If it works, skip setup. Use its schema and `search_assets` for fonts, devices
and decorations. Otherwise follow [first-use connection](references/connection.md)
yourself before asking the user to configure a server manually:

1. Identify the current host, Codex or Claude Code. Do not choose based on which CLI
   happens to be installed. Resolve `scripts/connect.mjs` relative to this skill file.
2. Run `node <skill-directory>/scripts/connect.mjs --host codex` or `--host claude`.
   It reuses a matching connection or registers the official HTTPS server through that
   host's CLI. An installed plugin already supplies the server; do not register it twice.
3. Complete the host's connection flow. If setup did not already sign in, run the
   returned login command, or use the installed plugin's native connection controls.
   The user completes browser login and chooses access; never request tokens in chat.
4. Call `get_capabilities` again. A successful configuration command is not proof of
   authentication or loaded tools. If a fresh session is needed, say so and give the
   same App Store request to resume. Do not keep retrying setup or start substantial
   reconstruction without a working connection.

Skill installation copies instructions; it does not run a post-install hook. This
first-use setup supplies the missing connection. Do not invent an endpoint, install
a local editor, download Chromium, or recover a retired release. Respect host approval
prompts and preserve unrelated settings. If connection is still unavailable, report
the specific blocker.

Start from the supplied App Store URL or screenshots. Keep original source records and
working assets in a named workspace directory. These local working files are not a saved
Crescreendo project. A user who already has their free app can still reconstruct a new
draft; do not request an upgrade before porting.

## Create, open and compare a draft

Upload files using `prepare_upload` and the scoped binary transfer instructions, then
`finalize_upload`. Use `create_draft` with the canonical document, verified resources,
ordered source capture IDs and App Store source. This creates no app and consumes no app
slot. Read [cloud operations](references/tools.md) for request and retry semantics.

Open the returned editor URL yourself before rendering, using the host's browser tool or
local desktop URL opener. Reuse the draft's tab when available; otherwise open one, even
if the browser is not already running. Only ask the user to open the link when the host
cannot do so. Follow [editor opening](references/tools.md#open-the-editor) and keep that tab
visible on the requested document and language. `render_project` asks that editor to capture
the saved revision; Vercel does not run a headless browser. Poll `get_render_result`, inspect the actual
images and revise the same document through `apply_project_revision`. Preserve source
order and distinguish technical validity from visual fidelity. When reconstruction work
ends, call `complete_reconstruction` at the current base revision. This freezes a content
baseline once; it is not a design approval and cannot be reset after adaptation.

The user can edit and export
without first saving to an app. The editor's **Save to project** action is the user's
choice: an existing app, a verified GitHub repository, or a new manually named app.
Multiple documents can belong to one app. A second app requires Pro; AI adaptation and editing also follow the access policy below.
Do not submit this save or contribution consent on the user's behalf merely because
porting was requested. There is no draft list or abandoned-work recovery workflow.

For follow-up AI edits, retain the document ID and read the latest revision. Promotion
to a saved project preserves that identity and does not expand the AI connection's access
to the destination app's other documents. See [live editing](references/live-edit.md).

## Reconstruction review and Pro editing

Read `get_capabilities.aiAccess` at the start and `get_project.aiAccess` before follow-up
work. These report the active policy, subscription, document phase and allowed actions.
Do not infer access from plan names or plugin installation. Under `reconstruction-pro-v1`
when `enforced` is true:

- Original reconstruction and corrections remain free while the phase is `reconstruction`.
- `complete_reconstruction` freezes contribution evidence, not the user's confirmation.
  After it, continue requested original corrections without resetting that baseline.
- The owner confirms the result with **Confirm reconstruction** in the editor. Never
  click it for them or treat saving/exporting as confirmation. Later MCP design edits
  require Pro; manually editing, saving and exporting remain free.
- Before adapting to the user's app, check `canAdaptWithAi` and the phase before preparing
  replacement assets or writing the new design. If confirmation is needed, direct the
  owner to the existing editor tab. If Pro is needed, show the returned billing link.
- MCP language-variant creation requires Pro, including during reconstruction review.
- On `ai_editing_upgrade_required`, stop the paid operation. Do not reframe it as source
  correction, create another reconstruction draft, or drive browser controls to bypass
  the limit. If checkout is unavailable, say so and retain the same document.

When enforcement is not yet active, report the current capabilities rather than claiming
the upcoming limit is already in effect. After an upgrade, reread capabilities and the
latest document; do not replay a stale edit. Follow [live editing](references/live-edit.md)
for adaptation, replacement and conversational changes. Your host's own AI/image billing
still applies; the Crescreendo subscription does not include those model calls.

## Establish the source

Use [the command reference](references/tools.md). Collect the URL's country and entire
ordered screenshot set. For another requested region or device set, use its actual
source, not an assumed translated copy. Inspect every source image and the necessary
detail crops using the host's image viewer. Page language does not identify image copy.
Keep immutable source records as the comparison truth, even after editing the document.

## Discover reusable assets

Identify the source's visual requirements and inspect accessible project resources.
Use `search_assets` to find plausible reusable candidates. Read [reusable assets](references/reusable-assets.md) for availability,
previews and application. A missing lookup command does not block source-based authoring
with existing tools, and a supported layer type does not mean its assets are installed.

Compare plausible candidates with the source before selecting one. Reuse a fitting
candidate; reconstruct from source evidence when none fits. A matching name or motif
alone does not establish a match, and a preset is not mandatory. Keep independently
editable parts separate so changing a decoration does not also remove its text or badges.
Record the choice and meaningful remaining differences in the project's existing review.

## Reconstruct the design

Use the available canonical document schema and its matching Crescreendo editor. Keep
titles and captions as editable text, shapes and decorations as supported editable
objects, and app UI/photo content as image assets. Keep device screens independently
replaceable. Observe the whole set: relationships spanning frames, different treatments,
font weight, line breaks, colour, clipping, perspective and shadows matter.

For both direct authoring and reused assets, read [source fidelity](references/source-fidelity.md)
before choosing the reconstruction method. Recognizing an object's meaning does not
identify its geometry. Derive its appearance from the source, compare an actual render,
and correct discrepancies before propagating the same treatment across the set.

Separate replaceable content from the design's pose, clipping and hardware. Use supported
native mockups for devices and independent image tilt for cards; inspect a real model
render before deciding it cannot match. Read [editable image planes](references/image-planes.md)
when reconstructing angled screens or cards. A tilted source cutout is not a reusable pose.

Do not impose a fixed design vocabulary, slide count or app-specific composition rule.
Do not flatten the full screenshot and overlay invisible editable text. Record an
unsupported effect or partially rasterized element's actual editing limitation.
Resolve fonts from real files; a guessed family name is not font identification.

Use [the project contract](references/projects.md) to bind verified image/font/model IDs
to the canonical document. Read the current revision before changing a
project. Submit a candidate with that revision; a conflict is not permission to overwrite
newer work. Keep an incomplete draft, but report its check failures. A successful save
or ZIP round trip does not demonstrate rendering or original-design fidelity.

For extraction, generation, restoration or extension, use [image reconstruction](references/images.md).
Use the host's real image tools and actual reference bytes. Register returned image files
in the project with their source hashes. No image provider API is built into this tool.

For an already open editor, use [live editing](references/live-edit.md). Read its current
revision and input/unsaved state before submitting a candidate. An uncertain response is
not permission to repeat the mutation with a new request ID.

## Inspect and finish

Use `render_project` with the cloud editor open and the editor's actual export, compare at source dimensions, then inspect
the whole set and each distinct visual treatment using [source fidelity](references/source-fidelity.md#compare-and-correct).
Reuse comparison evidence only for genuinely identical artwork and unchanged rendering.
Pixel metrics diagnose differences; they do not
approve design or prove editability. Distinguish source fidelity, approved substitutions,
schema validity, render success and human approval. Preserve failed outputs and explain
changes rather than adjusting the reference to match them.

Check edits to title, device image and background, then reopen the draft and export.
Restore test edits to the reconstruction before freezing its baseline; the user decides
whether to save it to an app.
Replace each distinct structural treatment with an obviously different test image:
front-facing and tilted devices, independent cards and cross-frame content. Verify that
pose, frame, crop, clipping and overlap survive both replacement and reopening. One
representative of an identical repeated treatment is enough; a straight screen does not
verify a tilted one. Record the actual UI replacement separately from an AI document edit.
Reuse completed evidence only when its document, assets, fonts and renderer still match.
When a renderer or required asset is unavailable, preserve completed source/asset work
and name the pending capability; do not deliver a flattened surrogate as an editable port.
Report actual model calls separately from deterministic checks. Avoid paid validation
when local comparison answers the question and follow the user's call/cost constraints.

Keep sources and drafts private. Upload only the project assets required for this flow;
public template contribution is a separate unchecked consent in the browser. The user chooses the original
set to reconstruct; collecting it does not grant redistribution rights.
