# Design core (unpublished)

The canonical document schema and pure document operations used by Crescreendo.
The explicit `exports` in `package.json` are the candidate public surface: schema,
metadata, queries, edits, geometry, typography, and DOM-free style calculations.
Editor UI, rendering, fonts/assets, account services, and IO are not included.

`npm run build` compiles those entries and their dependency closure into ESM and
declarations. `npm pack` includes the compiled files, canonical JSON Schema and this README. It
does not require a TypeScript loader, React, a DOM, or repository aliases.
Node 20.19+ is required. ESM `import` and CommonJS `require` resolve the same compiled
ESM files, including when existing `tsx` scripts run in a CommonJS host. There is no
second compiled schema or separate CJS implementation.

`/document` is the single canonical contract (`schemaVersion: 2`). The transitional
`/schema` entry was retired. `/design-document-json-schema` exports the JSON Schema
generator used for `schema/design-document.schema.json`; code refinements remain in
the canonical Zod validator. Public entry points intentionally include pure document
operations and geometry/style calculations, not the renderer or editor.

The final upstream code contract is integrated. Remote DB cutover, public licensing
and publication remain separate; no release or license grant is implied by this build.
