# Open balcony ground validation — 2026-10-18

Base: `d7d7c3a61d748c8fb2d45f9e7554ba2e0c9b8558`; its merged-main Web checks completed successfully before this change.

## Behavior

Optional draft `floorAreas` become existing native Rooms with explicit ordered boundaries. Wall parts reference the live wall path; free points and optional quadratic controls describe the open edge. Shared floor analysis supplies all downstream polygons and areas. No extra walls, collision barriers, ceiling or parallel floor store are created.

The existing room inspector edits boundary coordinates and references through native history. Wall reversal/splitting retains directed coverage. Missing references, crossing edges and zero-area edits retain repairable native input, report a Review finding and hide the invalid floor. Review opens the native room inspector via `selectedRoomId`; JSON and retained web project-package data preserve boundaries and import confidence.

## Local verification

- `npm run check`: zero errors/warnings.
- `npm test`: 1,397 tests in 156 files passed.
- `npm run build`: production build passed.
- Chromium: the two new browser cases at 1440 and 390 px passed. They import the synthetic open-balcony example, edit points/curvature, verify live area, Undo/Redo, unchanged walls/openings/furniture, actual 2D/3D/cut ground pixels, walkthrough mode transition, save/reload and Review URL focus.
- All 25 existing focused Chromium browser regressions passed, covering quick geometry correction, curved rooms, room continuity/deletion, persistent Review, semantic styling, legacy furniture previews and project packages. Full three-engine CI remains a separate PR gate.
- Unit coverage includes curved shared walls and reversed splits, native/package round trips, deletion/repair, calibration, source tracing, floor-only framing, and indoor entry when the terrace is larger than the house.

## Skill trial

The revised `reconstruct-plan2world` Skill and its contract passed `quick_validate.py` and a fresh independent trial on the original YJ215 raster (1536 × 1026, SHA-256 `aa86ba3b8262fd736cd13b98038e265f1733503537f00e1247fc6bc44b987ed7`). The focused trial read the source and Skill, without prior candidates/reference annotations or application implementation. It produced the lower-left L-shaped balcony, three adjoining walls and a wall-referenced ground outline. The application checker returned zero geometry errors/warnings and accepted registration; the trial also reviewed an overlay and independently checked anchor residuals/opening containment.

This is one focused Skill trial, not a new five-plan accuracy result or an expansion of the hard corpus. Original rasters and private trial files are not redistributed. Existing five-plan first passes/results remain historical.

## Limits and next work

- Ground extents require visible source evidence; uncertain/obscured limits must be omitted and disclosed.
- Partial overlaps with detected rooms are not clipped automatically. The contract prohibits duplicating an inferred room; users must correct the outline when needed.
- This iteration creates areas through draft import and edits them in Properties. Direct canvas creation and boundary drag handles remain future correction work.
- Native companion rendering/editing of explicit open boundaries, physical-device behavior and walking across the reconstructed source balcony were not qualified. Browser walkthrough tests here verify mode continuity; collision invariance and entry geometry are checked separately in unit tests.
