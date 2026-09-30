# Discover, compare and reuse assets

Use the connected MCP's `get_capabilities` and `search_assets` before reconstructing
an element that may already have a reusable definition. The original screenshots
remain the visual reference; a catalog match is only a candidate.

## Discover what is actually available

Search with the observed motif, device or font. Use the returned `nextOffset` for
additional results only when needed. Read each entry's actual definition, `requires`,
`availability` and `binaryIncluded` fields. A listed font family or device definition
does not supply its font file or GLB. Upload and finalize the required files through
the normal project resource contract. Never invent asset IDs or infer file availability
from a supported layer type.

If discovery is unavailable, describe that limitation and use accessible source evidence.
Do not download an old local editor, inspect private bundles, or claim to have searched
an unavailable library. Check the actual connected tool schema instead of assuming
commands or catalog fields exist.

## Compare before selecting

Identify silhouette, proportions, detail, material, colour and editable role from the
source. For a plausible returned definition, put its actual geometry or native device
properties in the draft and inspect a render from the open cloud editor at comparable dimensions. Compare
shape and spacing as well as the motif, including shadows and clipping. Do not force
reuse if it requires substantial distortion or loses characteristic details.

When no candidate fits, follow [source fidelity](source-fidelity.md) and reconstruct
from source evidence. Presets are optional; no app-specific rule or minimum reuse count
applies. Neither a successful render nor a valid schema establishes visual fidelity.

## Apply stable, editable objects

Store the selected paths, paints, supported device properties and real resource bindings
in DesignDocument v2, with unique layer IDs. Do not store a runtime preset lookup that
changes when the catalog changes. A device uses a native mockup; a tilted standalone card
uses an image plane. Keep independently replaceable content separate from decoration,
ratings and captions, even if the objects move together as a group.

Use `get_project` and `apply_project_revision` with the current revision and hash.
Resolve required files through `prepare_upload` and `finalize_upload`, then render the
changed draft. An asset definition does not grant redistribution rights to someone
else's images, fonts or models.

## Verify and record

Compare the applied object in its real composition using the
[comparison loop](source-fidelity.md#compare-and-correct). Test replacement for each
distinct structure, reopen and export; reuse evidence for identical unchanged treatments.
Record source region, actual candidate IDs, available version/content hashes, the reason
for reuse or reconstruction, actual render references and remaining limitations. Do not
turn visual observations into an automatic design pass score.
