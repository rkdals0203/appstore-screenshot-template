# Cloud operations

Use the actual connected Crescreendo MCP schema. The connection uses the production
service. Its `protocolVersion` is a wire-contract identifier, not the public plugin's
release version; read current capabilities instead of inferring features from that name.
If tools are unavailable, follow [first-use connection](connection.md) to prepare the
current host and authenticate. Report any remaining connection blocker before porting.
Never install an old local-editor release as a fallback.

| Operation | Use |
| --- | --- |
| `get_capabilities` | Current document schema URL, app entitlement, draft creation permission |
| `search_assets` | Available font, model and decoration descriptors |
| `prepare_upload`, `finalize_upload` | Scoped transfer of exact local resource bytes, then validation |
| `create_draft` | `requestId`, `title`, `source`, `document`, upload IDs in `resources`, ordered resource IDs in `screenshots` |
| `get_project` | Current document, resources, revision and `kind` for a known draft/project ID |
| `apply_project_revision` | Same document ID, latest `base` revision/hash, stable `requestId`, replacement document/resources/screenshots |
| `create_locale` | A language variant of the same document; no hosted model call |
| `render_project` | Request capture of the saved revision in the open editor; returns a job ID and editor URL |
| `get_render_result`, `cancel_render` | Observe every frame or cancel an unfinished job |
| `complete_reconstruction` | Fix the completed reconstruction baseline once with document ID, stable request ID and base revision/hash |
| `list_projects` | Saved projects permitted to the connection; no unsaved-draft inventory |
| `search_templates` | Published templates Crescreendo AI can adapt, with slide count and `estimatedCredits`; free |
| `start_adaptation` | **Paid.** `requestId`, `templateVersionId`, `app`, upload IDs in `screens`, user-approved `maxCredits`; returns the project ID and editor URL |
| `get_adaptation` | Phase of a Crescreendo AI adaptation (`waiting_for_editor`, `awaiting_approval`, `generating`, `finishing`, `failed`, `ready`) and the next step; free |

`source` contains the App Store `appId`, `url`, optional `storefront`, ordered image
resource IDs in `captures`, and an optional `repositoryHint` (`owner/repo`). The hint
only prefills the user's save choice. Missing evidence does not prevent personal saving,
but disqualifies contribution. Do not invent captures, hashes or completed visual checks.

Uploads transfer binary bytes directly using the returned, limited authorization.
Do not put large base64 files in the conversation or provide a server with a local path.
Hash, size, media validation and finalization must succeed before use.

For the matched Cloud tools package, write the `prepare_upload` response to a private
temporary JSON file and transfer its exact resource from the project directory:

```bash
porting-tools upload <project-directory> --prepared <private-response.json> --origin <verified-Crescreendo-app-origin>
```

Use the app origin advertised by the connected service, not an origin guessed from a
reference page. The command verifies the local hash and destination, sends binary parts,
and returns an upload ID without its ticket. Call `finalize_upload` next. Remove the
temporary ticket file after transfer. If it expires, repeat `prepare_upload` with the
same request ID and resource, then retry; do not restart the reconstruction.

Read a target before changing it. On revision conflict, re-read and reconcile rather
than force overwrite. Retry an uncertain mutation with the same request ID and input;
never mint a new ID to work around an unknown result. `editor_busy` means human input
has priority; wait and retry the same change after the editor is ready.

## Open the editor

Opening the returned `editorUrl` is part of the agent's reconstruction task. Use the host's
browser tool to reuse this draft's tab or open one when absent. If no browser tool is
available but the agent runs on the user's desktop, use its supported URL opener to launch
the default browser. Do not require Chrome or an already running browser. A remote/headless
shell is not the user's desktop; if no host capability can open it there, provide the exact
editor link and ask the user to open it. Reuse that link/tab on retries instead of opening duplicates.

Verify the requested document is loaded with its guest or account access when browser inspection is available.
An opener command's success alone does not prove the editor is ready; without inspection,
use the render job's progress as confirmation. Reuse the browser which approved guest
access; a copied URL does not carry its private cookie. Account connection tokens do not
establish a browser account session.

Open the editor before calling `render_project`; keep the requested document and language
visible. `execution: editor_browser` requires that authorized editor tab.
While queued, `requiredAction: keep_editor_open` means open/resume the tab and let pending
edits save; it is not a request to start a local server. If the tab closes, capture pauses
until an eligible tab takes the expired lease. Poll the same job instead of creating duplicates.
On `render_wait_timeout` or `render_retry_exhausted`, reopen the editor, read the latest
revision and retry deliberately. On missing resources, fix the named resources first.
Use the recorded browser/runtime and revision for comparisons. Completed jobs remain
addressable by ID; a new request does not reuse another browser's pixels automatically.

A render succeeds only when all requested frames succeed. Missing fonts, models and
images are failures, not reasons to substitute silently. Render diagnostics are
technical observations, not design approval. Compare actual images at source dimensions.
The editor URL comes from the server.

Deterministic local source collection and pixel comparison may use already available
source tools (`capture`, `files`, `asset`, `compare`, `check`). These do not require a
local editor. If the CLI is not installed, prepare the published source in the task's
workspace (reuse an existing matching checkout):

```bash
git clone https://github.com/rkdals0203/appstore-screenshot-template.git
cd appstore-screenshot-template
npm ci
npm run build
node packages/porting-tools/dist/public-cli.js --help
```

Use that CLI's resolved absolute path for commands from the project directory. These
source packages are not npm registry releases. The build installs no editor or Chromium.
Image generation/restoration uses the host's image tools.

## Guest and account access

`get_capabilities.authentication` is `guest` or `account`. A guest response includes the
temporary editor URL, document creation permission, free external-AI editing access and
`adaptation.requiresLogin` / `credits.requiresLogin`. It never includes a credit balance.
The guest can attach one document; document reads, revisions, uploads, history and renders
remain limited to that work. Login transfers its identity without broadening this grant.

`get_project.aiAccess` reports current actions and revision. External AI editing is free;
`complete_reconstruction` freezes contribution evidence, not a paid editing phase.
`login_required` means choose Save to project or Crescreendo AI in the editor.
`guest_session_expired` means this work can no longer be accessed. On a rate limit, respect
`Retry-After`; polling and token refresh do not extend a session's lifetime.
