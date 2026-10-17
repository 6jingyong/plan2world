# Semantic white-model reconstruction and user styling

The first stage reconstructs architecture and source-derived furniture occupancy. The second stage lets users choose a concrete local style on the same native object. Both use the existing `Project`, selection, Undo/Redo, room analysis and viewer; there is no alternative scene or geometry store.

## Actual Skill verification

Five fresh independent Skill applications used the exact five user-supplied source rasters. Before saving the first pass, each trial read only the raster and the new provider-neutral Skill, without historical candidates or source-reference annotations. Each then ran the repository's deterministic inspector and reviewed overlays of walls, openings and furniture against the source. Final edits include removing an unsupported YJ215 kitchen opening, correcting Hyde Park bathroom diagonals and adding a visible Beike bathroom door. No external provider request or model comparison was made.

[Run identity and source hashes](../../tests/fixtures/real-floorplans/white-model-skill-v1/run.json) match the existing five hard-corpus sources. The fixture directories retain first-pass and final draft JSON, final structural reports, and individual review notes. Raster images and source-derived overlays are not redistributed.

| Source | Walls | Doors/openings | Windows | Blocks | Errors | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| decorated-yj215 | 47 | 12 | 11 | 87 | 0 | 0 |
| one-hyde-park | 110 | 35 | 21 | 164 | 0 | 1 |
| curved-lianjia | 85 | 21 | 12 | 27 | 0 | 3 |
| black-hidden-doors | 27 | 10 | 1 | 12 | 0 | 0 |
| large-irregular-beike | 83 | 18 | 15 | 38 | 0 | 2 |

All five final drafts have accepted registration and survive native conversion. The six warnings concern a detached Hyde Park partition island, two detached curved foyer screens and three short source-visible jogs/piers. They were retained and disclosed rather than suppressed to improve a score. Curved Lianjia uses native `curvePoint` walls. Derived room-face counts are not source room counts.

These are structurally valid, visually reviewed drafts, **not a declaration that the five homes are fully correct**. Remaining gaps:

- Balcony railings/dashed boundaries are not solid walls. Some balcony floors cannot be derived from the current closed-wall room topology. The Skill now explicitly requires this limitation to be disclosed; adding artificial walls would misrepresent the source.
- Hidden doors, dense ensuite/service cores and watermarks leave uncertain openings or boundaries. Furniture height, divider height and floor-to-ceiling glazing remain editable assumptions.
- Source registration only tests that anchors and geometry share a consistent transform. It does not prove visual correctness. Existing historical partial wall references were not used as truth, and no new image-accuracy score is claimed.
- Only the synthetic editor workflow is covered by the new browser regression. Five real drafts were checked by parser, schema, native conversion and source overlays; they were not each walked through in all browsers.

## Product behavior

Opt-in `presentation: "semantic-white-model"` uses wall-height fixed glass from floor level when the draft omits window height/sill/type. Legacy drafts retain their old defaults. Semantic furniture requires `imported_object`, source category and three positive dimensions. Recalibration scales the footprint with the plan, preserving estimated vertical height.

3D edit-mode picking resolves walls, doors, windows and nested furniture to the same native primary selection used in 2D. Existing highlight materials apply to all those meshes, and wall transparency still affects wall bodies alone. The property panel offers 24 existing local procedural furniture styles and a return to the semantic block. Replacing a style snapshots raw dimensions before changing catalog defaults, preserving ID, source category, position, rotation, mirror scales and occupancy. One Undo restores the previous style; JSON/local saves retain the choice. Existing door/window type controls remain the style entry point; fixed, divided and sliding window presentations use the saved type in 3D. Bay style currently uses a three-panel frame within the existing aperture; it does not add a projecting bay volume.

The independent Skill is versioned in its own synced skills repository; the application repository includes the same snapshot for review. Provider transport calls the neutral instruction builder. The JSON contract remains provider-independent.

## Next priority

Represent balcony/slab boundaries independently from solid wall enclosure, using the existing floor/room geometry path. This addresses the largest observed gap between a correctly traced white model and a complete walkable home. Keep ambiguous source details exposed in Review; defer a larger furniture library and model/provider comparisons.

## Implementation validation

- 1,378 unit tests passed across 154 files.
- Production-mode Svelte check: zero errors/warnings; production build passed.
- All ten stored first/final drafts and the synthetic example passed formal JSON Schema validation.
- Nine focused Chromium cases passed across targeted runs: three selection/focus continuity cases, three quick geometry-correction cases, viewer invalidation, and the new desktop/narrow semantic-block workflow. The new cases verify rendered-surface picking, visible style redraw, Undo/Redo, retained furniture/door/window geometry, acknowledged save completion and reload.
- Full Chromium/Firefox/WebKit coverage remains the GitHub CI gate. The five real images have not each been qualified in every browser.

## CI compatibility correction

The first full PR run found a shared failure in the unchanged legacy-preview and native-package browser tests on all three engines. `sourceCategory` also stores unsupported import categories such as `future-appliance`; using its presence to identify a semantic white-model block changed legacy labels and previews. The fix records native `renderStyle: "block"` only when converting the opt-in draft presentation. Labels, block rendering and style controls require that explicit presentation; legacy imports keep their existing preview and localized “Unrecognized item” name. Returning from a chosen model to a block retains the marker through save/load. No failing legacy browser assertions were removed or relaxed. Two added unit regressions failed before the fix and passed after it; the complete unit suite now has 1,380 passing cases.

The unchanged legacy-preview/native-package suites and the semantic-white-model suite passed together locally: **15 Chromium cases**, including both desktop and narrow viewports. Production check/build also passed. Full three-engine CI is rerun on the corrected PR head; local results do not stand in for that gate.
