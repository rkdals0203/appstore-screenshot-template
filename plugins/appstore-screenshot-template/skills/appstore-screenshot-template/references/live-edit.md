# Edit an open cloud document

Use `get_project` for the known document ID before every follow-up and check its `aiAccess`. Draft promotion does
not change that ID. Use the latest revision/hash in `apply_project_revision`, including
a stable mutation request ID. Send only the intended edits, preserving unrelated work.

Adaptation and continued edits using the user's own AI are free, including in a guest
workspace. Read the latest capabilities; no reconstruction-confirmation or Pro gate is
required for this path. Prepare only the changes the user requested, preserving image
frames, tilt, crop and device pose. Do not assume adaptation needs a new document or app.
Crescreendo's hosted AI is a separate account-and-credit operation on published templates.

For an authorized adaptation to the user's app, follow
[Reference adaptation](reference-adaptation.md). It is the same design guidance
used by Create's separate reference-adaptation path; it does not change the
original-reconstruction task or authorize a different server execution mode.

The server checks document ownership, connection scope, revision and active editor state. Human
IME input, dragging and unsaved changes take priority. On `editor_busy`, allow those
edits to finish; on revision conflict, fetch the latest state and reconcile. Do not
force overwrite, create a replacement project, or repeat an uncertain request with a
new mutation ID. A successful server save and visible browser application are different
acknowledgements. Refresh the known target if its visual acknowledgement was lost.

Keep the matching editor tab open and render the committed revision to inspect the effect.
Capture reads a saved snapshot; it does not freeze or replace the human edit state. Reuse comparison evidence only
when the document, assets and render runtime still match. Test replacements must preserve
pose, crop, clipping and overlaps; an AI JSON edit does not prove that the user's image
replacement control works. Record those two checks separately.

Use the user's existing editor tab. Do not install/open a local editor or change the
permanent app destination as part of an ordinary AI revision. The browser offers saving
and optional template contribution directly to the user.
