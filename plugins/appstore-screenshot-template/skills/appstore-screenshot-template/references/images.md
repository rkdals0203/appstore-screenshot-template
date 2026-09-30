# Extract and reconstruct image assets

1. Inspect the original image and identify the desired object's visible bounds, occlusion,
   perspective and surrounding pixels. Preserve the untouched original.
2. Reuse a suitable actual asset when available. Extract visible pixels when sufficient.
   Use the host's image editing/generation tool for clean reconstruction or extension when
   needed, passing the actual image/crop and describing what must be retained or changed.
3. Keep generated hidden content explicitly identified as inferred. In particular, unseen
   app UI is not recovered original UI. Do not replace crisp editable type or vectors with
   generated raster simply to avoid document authoring.
4. Inspect the output next to its source, then save the real returned file to the project
   with `asset`. Use the original image reference and SHA-256 in `sources`; describe the
   operation, name the tool actually used and record any inferred content. An import is
   not a visual approval or proof that a tool was executed.
5. Bind the registered asset ID through the document renderer's supported resolver to an
   image layer or replaceable screen. Check clipping, scale, edges and colour in the actual
   full-frame render. Preserve earlier asset records so comparisons can be reproduced.

Asset specs support `original`, `extracted`, `generated`, `edited`, `outpainted`. Derived
assets require source references; the latter three also require a tool name. The command
does not generate or modify image pixels. See the package README for a concrete spec.
The host's tool availability and cost policy apply. A generated-looking fixture or
deterministic replay is not evidence that image generation succeeded.
