# Edit an open cloud document

Use `get_project` for the known document ID before every follow-up and check its `aiAccess`. Draft promotion does
not change that ID. Use the latest revision/hash in `apply_project_revision`, including
a stable mutation request ID. Send only the intended edits, preserving unrelated work.

Before adapting a reconstruction to another app, check `canAdaptWithAi` and ask the owner
to confirm the source reconstruction in the editor if its phase is still `reconstruction`.
Prepare only the content and layout changes the user requested; preserve unrelated edits,
image frames, tilt, crop and device pose. Do not assume template adaptation requires a
new document or changing the app destination.

With the Pro-editing policy active, source corrections are free before owner confirmation;
subsequent MCP design changes and AI language creation require Pro. `save_version` remains
available within ordinary access. `ai_editing_upgrade_required` is not retryable until
access changes. Show the returned editor/billing links; never bypass it through a new draft
or browser automation. The owner can still edit manually and export. After payment, read
access and revision again before continuing.

The server checks subscription, workflow, ownership, connection scope, revision and active editor state. Human
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
