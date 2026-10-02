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
3. Complete the host's connection flow. If setup did not already authorize the connection, run the
   returned login command, or use the installed plugin's native connection controls.
   The user approves the AI connection in the temporary editor. A guest does not need
   a Crescreendo account. The CLI may call this OAuth action “login”; it is not account
   sign-up. Never approve the modal for the user or request tokens in chat.
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
slot. A guest connection can create one document in its temporary workspace; retry
that document rather than creating another. Read [cloud operations](references/tools.md) for request and retry semantics.

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
choice: an existing app, an App Store search result, or a new manually named app.
Saving first asks a guest to sign in, then transfers the same document to that account.
Multiple documents can belong to one app. A second app requires Pro. Using the user’s
own AI to adapt or edit the document remains free.
Do not submit this save or contribution consent on the user's behalf merely because
porting was requested. There is no draft list or abandoned-work recovery workflow.

For follow-up AI edits, retain the document ID and read the latest revision. Promotion
to a saved project preserves that identity and does not expand the AI connection's access
to the destination app's other documents. See [live editing](references/live-edit.md).

## Your AI and account access

Read `get_capabilities` at the start and `get_project` before follow-up work. When
`authentication` is `guest`, retain the returned temporary `editorUrl` and reuse the
browser that approved the connection. A URL alone grants no access in another browser.
Original reconstruction, adaptation with the user's AI, further edits and language
variants do not require Pro or account login. Do not ask for **Confirm reconstruction**
as a payment step. `complete_reconstruction` only freezes contribution evidence.

Sign-in is required for **Save to project** and Crescreendo's own paid AI. On
`login_required`, direct the user to that action in the existing editor. A
`guest_session_expired` response is different: stop using that session, preserve local
source work and explain that a new connection is needed. Do not create a replacement
account, silently overwrite an existing project or retry an uncertain edit with a new ID.
A deployment without guest support may still require its existing account connection;
report the server's actual state rather than claiming guest access is active.

After sign-in, reread the same document and its revision. The original guest connection
still only controls this document; account ownership does not grant access to other apps
or permission to create another project. Follow [live editing](references/live-edit.md).
The host's own AI and image-tool usage is billed by that host.

## Crescreendo AI adaptation (paid, credits)

When the user wants a finished set for their own app, offer Crescreendo AI as one option
next to doing the work yourself. It adapts one of Crescreendo's published templates to
the user's app and spends the user's Crescreendo AI credits. Pro includes monthly credits;
real accounts start with a one-time trial. Guest connections create neither accounts
nor trial credits. This tool does not edit an arbitrary reconstructed document.

- Check `get_capabilities.adaptation.available` and `credits`. If adaptation is not
  available, do not offer it. If `requiresLogin` is true, direct the user to **Crescreendo
  AI** in the existing editor before credit lookup, preparation or model requests.
- After login, reread capabilities. If this document-only connection lacks new-project
  permission, use the account's connection approval to explicitly grant it, or continue
  in the Create screen. Do not expand the guest grant or automatically retry a paid task.
- Find a template with `search_templates`. Show the name, slide count and
  `estimatedCredits`, and let the user choose.
- Ask the user to approve the estimated credits. Pass exactly that limit as `maxCredits`;
  never raise it on your own.
- Upload the user's real app screenshots with `prepare_upload`/`finalize_upload` and pass
  their upload IDs as `screens`. Each upload can start one project.
- Call `start_adaptation` with a stable `requestId`. Retrying with the same `requestId`
  returns the same project and never starts a second adaptation.
- Ask the user to open the returned `editorUrl`. Crescreendo AI analyzes the app and
  proposes a direction there; only the user approves it, in the editor. Never approve it
  for them or drive the browser to do so.
- Poll `get_adaptation` and relay its `next` guidance. When the phase is `ready`, read the
  project with `get_project` and review it with `render_project`.
- On `insufficient_ai_credits` or `app_limit_reached`, stop and show `upgradeUrl`. On
  `credit_limit_exceeded`, ask before retrying with a new limit.

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
