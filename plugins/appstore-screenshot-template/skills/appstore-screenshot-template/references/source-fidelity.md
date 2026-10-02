# Reconstruct from source evidence

Use this for direct document authoring as well as reused assets. It needs no library
command or particular tracing tool. The task is to preserve observed appearance and
intended editing, not to redesign the set into a consistent style of your own.

Use the shared [observation and comparison procedure](visual-reference-method.md).
The additional choices below concern original reconstruction; adaptation changes
the user's content and brand while preserving the observed design decisions.

## Choose a representation

Inspect the relevant original region at native resolution. Identify the visible shape,
internal gaps, edges, colour, placement and overlap, then choose a method that can
preserve them. Keep a concise source/method note in the existing project review for
distinct treatments; an inventory entry for every repeated object is unnecessary.

| Available evidence | Useful reconstruction path |
| --- | --- |
| A matching original or reusable asset | Verify its actual appearance, then reuse its geometry or file. A familiar name or same meaning is insufficient. |
| Clear geometric or flat-colour artwork | Fit measured native primitives or paths when they represent the shape accurately; trace visible raster contours when that better preserves it. |
| Editable typography | Use real font files and compare glyphs and layout. Font identification and text-box fitting are separate; neither proves the other. |
| Photos, app UI or complex image content | Keep image content as an asset; use [extraction and reconstruction](images.md) where needed. |
| Content inside a device or transformed card | Separate content from pose, hardware and clipping using [image planes](image-planes.md). A baked image can resemble the source without satisfying replacement behavior. |

These are choices based on evidence, not a mandatory sequence or a requirement to trace
everything. A formula is useful when its geometry fits the source. A generic symbol,
guessed path or default preset is only a hypothesis until its actual render is compared.
Missing content cannot be recovered by contour tracing; keep inference and unsupported
effects explicit rather than inventing unseen detail as original artwork.

## Preserve the visual decisions

For vector or geometric artwork, distinguish filled silhouettes from stroked lines.
Observe contours, cutouts, stroke thickness, end caps and joins; a shared outline style
can change the design even when the object remains recognizable. If tracing, keep the
source hash, crop and tool/settings used. Trace paths approximate visible pixels; they
do not recover the original vector source. Keep independently editable content separate.

Measure the visible artwork, not just its enclosing frame or SVG viewBox. Internal
padding and stroke width affect the rendered size. Derive scale, colour and placement
from each distinct source treatment; putting different objects in equal boxes does not
make them match their originals. Preserve actual source differences instead of applying
one size, stroke or colour convention to an entire category.

Before repeating a shared construction, compare a representative render so an incorrect
assumption is not multiplied. Different shapes are different treatments even when they
share a role, layer type, viewBox or authoring helper. A verified device pose or one
decoration does not validate unrelated artwork elsewhere in the set.

## Compare and correct

Compare actual editor output with the original at equal dimensions. Inspect the complete
composition and the regions that determine each distinct treatment. Use crops from the
same source coordinates; alignment or resizing for diagnosis must not replace the
unaligned comparison or hide placement/scale differences.

When a difference appears, locate its cause before revising: source extraction/content,
authored geometry/style/placement, font or model substitution, or actual rendering.
Check the saved properties and resource identity rather than assuming the renderer
changed an authored shape. Correct differences that the available evidence and tools
can resolve, then compare the changed treatment again. Unchanged inputs can reuse their
previous evidence; no full-set/model rerun is needed for every small revision.

For unresolved differences, record what remains and the actual missing source, tool
capability, or user-imposed time/cost boundary. Merely listing a visible mismatch as a
limitation does not complete the reconstruction. Preserve a useful partial project
when blocked, without calling it faithful or independently editable where it is not.
Do not use a fixed pixel score to approve design or an extra model judge when direct
source comparison answers the question. Visual fidelity, editing behavior and successful
schema/save/render checks remain separate claims.
