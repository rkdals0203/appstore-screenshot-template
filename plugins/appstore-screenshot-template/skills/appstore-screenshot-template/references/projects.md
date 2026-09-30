# Document and project contract

Use the canonical DesignDocument schema returned by `get_capabilities`. Do not create a
porting-only format. A draft and a saved project share the same document ID, resources,
locale variants and revision contract.

Resource IDs identify declared images, font files or device models. Upload exact files
and verify finalization; persist stable IDs rather than local paths, blob URLs or signed
transport URLs. Keep source captures immutable and ordered. `screenshots` provides the
ordered screen bindings used by the document. Do not overwrite unrelated resources that
happen to share a filename.

Use the latest server revision and document hash for every edit. A stale revision is a
conflict, never permission to overwrite. Retain source/asset provenance and actual render
comparison records in the working directory; a schema check is not visual approval.

Call `complete_reconstruction` once when the reconstruction phase ends, before opening
the result for adaptation. It records the complete design and referenced file contents,
including language documents, and original captures. It does not confirm the result for the user, change AI editing access, grant quality approval or
publish anything. Owner confirmation is separate server metadata, outside document JSON and Undo. Later edits may make the result ineligible for contribution; do not
reset the baseline to disguise those edits.

Only the user chooses **Save to project** in the editor. A draft does not consume the
one-app Free allowance. Multiple documents can be saved under one existing app. Saving
promotes the same document rather than copying it or replacing another project.
Contribution is a separate, unchecked browser choice available only when the original
baseline and evidence still match and no official template exists. MCP cannot consent.
