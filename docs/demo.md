# README demo

One example runs through the README: X's App Store screenshots, their editable reconstruction, and an adaptation for Crescreendo.

| Visual | What it must show |
| --- | --- |
| Reference → editor | The same original wording and colors, with actual text selection, layers and typography controls visible. |
| Replace the screen | A real file replacement and headline edit. Device pose, crop, overlapping cards and the panorama relationship survive the replacement. |
| Your app | Four complete PNG exports from the nine-frame Crescreendo adaptation. |
| Save and reopen | Save to an existing app, return to Projects, and reopen the same saved document. |

Capture in the Development cloud environment. This is not evidence that the public Cloud release is available; see the [release checklist](release-checklist.md).

The Crescreendo mobile screens inside the mockups are authored concept artwork, not a shipped mobile app. The surrounding editor controls and interactions must come from real captures. X is an independent reference, not a sponsor or an endorsement.

## Capture rules

- Use continuous screen recording at 30 fps or higher; deliver 25 fps GIFs. Do not duplicate a sparse screenshot sequence and call it smooth recording.
- Keep replacement at 10–14 seconds and saving at 8–12 seconds. Cut waiting and the native file picker; label the clips **Time compressed**.
- Do not draw selection outlines, pointers or working controls onto screenshots. Crop and arrange real captures for readability.
- Use 1600px-wide primary stills and 1200px-wide GIFs. Target 500 KB per still and 4 MB per GIF; preserve legibility before reducing colors.
- Keep the four result frames complete and equally spaced. Frames 1 and 2 share one panorama object, but remain separate PNG files.
- Keep original project files, fonts, models, captures and recordings in the private evidence folder. Only reviewed derivatives go into this repository.

## Evidence before release

Verify all nine browser-exported PNGs from the cloud editor, text overflow, preserved replacement geometry, save/reopen document identity and matching revision. Record content hashes and measured media properties in `media/provenance.json`. The media check must pass before assembling the public candidate.

See the [case study](x-case-study.md) for the design's editable structure and remaining fidelity limits.

## Recorded result

The September 29 Development session produced both clips from continuous tab recordings: replacement is 12.44 seconds and saving is 11.60 seconds, each delivered at 25 fps. Actual file replacement preserved the phone geometry; saving and reopening retained the same document and revision. [Measured files and provenance](../media/provenance.json).

The nine final PNGs came from the browser editor's export command. A separate nine-frame server render timed out at 180 seconds and was canceled; these visuals do not certify that server job as successful. The source-comparison image reuses the preserved September 26 reconstruction render, as labeled in the [case study](x-case-study.md).
