# Editable device screens and image planes

Content belongs to an image asset. Frame, rotation, tilt, crop, clipping and stacking
belong to the document. Changing the asset must preserve the latter.

- For physical devices, use a native `MOCKUP` and a real declared GLB. For a flat frame,
  use the native flat mockup. A device photograph with a hole is not a rotatable mockup.
- For an independent card, obtain a front-facing asset and author an `IMAGE`. Its
  `rotation` is an ordinary 2D rotation. Runtime 0.2.0 adds optional
  `tilt: { rotationX, rotationY }`, each in degrees from -60 to 60. Omission means zero.
  Inspect the connected service's actual schema and capabilities before authoring tilt; reject an unsupported field instead of flattening it.
  Do not invent an unpublished download URL or remove tilt to make an old runtime accept it.
- The image plane uses orthographic X/Y tilt followed by the ordinary Z rotation.
  It needs no GLB or WebGL. Strong perspective with converging edges is not supported
  by this tilt; compare and report that difference instead of baking it into a replaceable asset.
- `linkedMagnifier` inherits its source mockup pose. Do not add independent tilt or
  create a hidden mockup solely to give an unrelated card a transform.
- Rectify visible source content before applying the authored pose. Avoid double
  perspective. Keep original bytes and extraction provenance; masked, unknown content
  is not restored merely because it was separated. Image restoration is an independent
  content task, governed by the image tool's actual capabilities.

In runtime 0.2.0, Replace changes only content: it preserves the frame, `scaleMode`,
normalized crop, rotation, tilt, corners and effects. Different aspect ratios use the
existing FILL/FIT/STRETCH policy. Inserting a new image still uses its intrinsic aspect.
An explicit request to change the layout can separately change those design properties.

## Evidence

Use a clearly different grid or sample screen, including a different aspect ratio.
Exercise the editor's actual file replacement, save, reopen and export. Compare projected
corners, mask fit and overlaps, and retain before/after captures with document and runtime
identifiers in the project's existing review record. AI revision edits are a separate test.

Check schema validity, render success, editability and source fidelity separately.
A known rasterized pose remains an unfinished replacement capability, even if the
limitation is disclosed. Avoid arbitrary design pass scores or app-specific rules.
