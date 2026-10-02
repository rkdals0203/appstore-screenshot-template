# Tools and document contract

[README](../README.md)

The public packages are `@crescreendo/design-core` (DesignDocument v2 and operations) and `@crescreendo/porting-tools` (collection, local working files, comparison and transfer). Cloud preview version: `0.1.1`. They are distributed as source in this GitHub repository, not as npm registry releases.

Run `porting-tools --help` for exact commands. Local commands are `capture`, `files`, `asset`, `compare`, `init`, `check`, `read`, `save`, `pack`, `unpack`, and `upload`. They do not create a permanent app or run a local editor.

## Binary transfer

1. Ask MCP `prepare_upload` for the exact resource descriptor and stable request ID.
2. Store the response privately and transfer the file:

```bash
porting-tools upload ./workspace --prepared ./upload-response.json --origin <verified-app-origin>
```

3. Call MCP `finalize_upload` with its upload ID. Delete the short-lived ticket file after use.

The uploader checks content SHA-256, size, destination origin and upload path. It sends binary chunks directly, refuses redirects, and never prints the signed ticket. Refresh an expired ticket using the same request ID; do not change the asset mid-retry.

## Cloud editing

Use the connected MCP tool schemas as the live contract. `create_draft` returns an editor URL and revision. `apply_project_revision` requires the current revision/hash and an idempotent request ID. `complete_reconstruction` fixes the source reconstruction baseline once. Only the user-facing Save to project flow promotes it to an app.

`render_project` captures in the authenticated, open editor tab. Keep the requested document and language open. It and `get_render_result` identify the exact rendered revision and every frame. Pixel comparisons diagnose differences, not aesthetic quality.

## Source builds

```bash
git clone https://github.com/rkdals0203/appstore-screenshot-template.git
cd appstore-screenshot-template
npm ci
npm run build
npm test
node packages/porting-tools/dist/public-cli.js --help
```

The repository contains only the public dependency closure. Its build and installation must not require a service account, private source alias, browser download, or editor bundle.
