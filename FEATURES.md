# Plan2World capability reference

This file describes the current Plan2World path that matters for reconstruction validation. It is not a historical upstream feature wishlist and is not a declaration that every real floor plan is reconstructed correctly.

## Reconstruction

| Capability | Current behavior | Evidence / limits |
| --- | --- | --- |
| Provider-neutral image reconstruction | `skills/reconstruct-plan2world` produces `plan2world-draft-v1` from a source floor-plan raster. The model/provider boundary ends at JSON. | Contract: `docs/plan2world-draft-v1.md`; schema: `schemas/plan2world-draft-v1.schema.json`; Skill: `skills/reconstruct-plan2world/SKILL.md`. Image accuracy still requires fresh source-based review. |
| Walls | Draft walls are zero-width centrelines; straight walls and native quadratic curves are supported. | Conversion/geometry coverage includes `tests/semantic-white-model.test.ts`, `tests/curved-wall-openings.test.ts`, `tests/floor-analysis.test.ts`. Do not replace a visible simple curve with many tiny facets. |
| Doors and windows | Openings are hosted on existing wall paths. Curved-wall placement and live opening correction use the shared physical path. | `tests/wall-path.test.ts`, `tests/opening-hit-testing.test.ts`, `tests/browser/curved-openings.spec.ts`, `tests/browser/quick-geometry-correction.spec.ts`. |
| Scale and source evidence | Drafts retain measured/estimated scale information, assumptions, registration and Review evidence. | `tests/plan2world-project-evidence.test.ts`, `tests/browser/persistent-reconstruction-review.spec.ts`. Registration consistency is not proof of visual correctness. |
| Semantic furniture | Reconstruction can emit source-derived semantic furniture blocks using the fixed `plan2world-furniture-v1` vocabulary. | `tests/semantic-white-model.test.ts`, `tests/furniture-styling.test.ts`, retained validation `docs/reviews/2026-10-17-semantic-white-model.md`. Fine dimensions/orientation remain editable estimates unless source-supported. |
| Balcony / terrace policy | Recognized balconies/terraces default to independent enclosed glazed rooms under the declared Skill policy, except where source evidence triggers the guard. | The policy is defined in the Skill/agent contract. It is an explicit product assumption and must be disclosed, not presented as observed source glazing. |
| Open ground outlines | Source-explicit open balcony/terrace ground can use `floorAreas`, referencing live walls and free straight/curved edges without fake closure walls or ceilings. | `tests/open-floor-boundaries.test.ts`, `tests/browser/open-floor-boundaries.spec.ts`, `docs/reviews/2026-10-18-open-ground.md`. No automatic clipping of partially overlapping outlines. |

## Review and correction

| Capability | Current behavior | Evidence / limits |
| --- | --- | --- |
| Reconstruction Review | Import evidence, assumptions and geometry findings can be reopened and focused into the editor. | `tests/browser/persistent-reconstruction-review.spec.ts`, `tests/browser/review-editor-focus.spec.ts`, `tests/review-correction-focus.test.ts`. Confidence describes the import evidence, not a fresh assessment after edits. |
| Native project conversion | Valid drafts convert into the existing openPlan3D `Project`/`Floor`/wall/opening/furniture model rather than a second scene graph. | `src/lib/plan2world/draft.ts` plus Plan2World unit tests. |
| 2D correction | Native wall/opening/furniture selection, properties, geometry correction, Undo/Redo and save/reload remain available after import. | `tests/browser/quick-geometry-correction.spec.ts`, `tests/browser/geometry-drag-undo.spec.ts`, `tests/browser/3d-focus-continuity.spec.ts`. |
| Room/floor analysis | Room polygons and areas are derived from current native geometry; explicit open-ground boundaries share the same downstream floor path. | `tests/floor-analysis.test.ts`, `tests/rooms.test.ts`, `tests/open-floor-boundaries.test.ts`. Derived room-face counts are not source room counts. |
| Semantic block styling | Imported semantic furniture blocks can be replaced with existing local procedural styles while retaining native identity, placement and dimensions. Existing door/window type controls remain available. | `tests/furniture-styling.test.ts`, `tests/browser/semantic-white-model.spec.ts`. |

## 3D and walkthrough

| Capability | Current behavior | Evidence / limits |
| --- | --- | --- |
| Three.js 3D view | Native project geometry renders through the existing viewer; 2D and 3D share native selection/state rather than parallel geometry. | `tests/browser/3d-focus-continuity.spec.ts`, `tests/browser/room-analysis-continuity.spec.ts`. |
| 1.20 m architectural cut | The cut keeps lower architecture and removes upper wall geometry using current native geometry. | `tests/browser/architectural-cut.spec.ts`. |
| First-person walkthrough | Existing walkthrough uses live room geometry, automatic entry selection and collision. Door width corrections remain live across plan, cut and walkthrough. | `tests/walkthrough-entry.test.ts`, `tests/browser/walkthrough.spec.ts`. Real-plan walkthrough quality must still be validated case by case. |
| Persistence | Native edits and supported reconstruction evidence survive the existing local/project-package paths. | `tests/projectPackage.test.ts`, `tests/browser/project-package.spec.ts`, Plan2World evidence tests. |

## Validation policy

A reconstruction candidate is frozen evidence. After a JSON is emitted for a validation run, do not hand-edit that JSON or repair its native/3D result to make the case pass.

Find the earliest incorrect artifact instead:

```text
source image
  → Skill output JSON
  → validation / normalization
  → native Project
  → 2D / 1.20 m cut / 3D
  → walkthrough / collision / input
```

Repair the reusable layer responsible for the first error and create a separate fresh reconstruction when the Skill itself changes. See `AGENTS.md` for the canonical responsibility boundaries.

## Current known limits

- Real floor-plan extraction is not certified by schema validity or clean geometry checks alone; source-image review remains necessary.
- Hidden doors, dense service cores, watermarks and ambiguous boundaries can remain uncertain and should be disclosed rather than invented.
- Furniture acceptance is semantic presence/type/broad position, not exact product geometry.
- Source registration validates transform consistency, not visual accuracy.
- Open-ground extents require visible evidence; uncertain extents should be omitted/disclosed.
- Browser regressions establish named flows, not every physical device/browser combination.
- Plan2World is not BIM, structural analysis or photorealistic reconstruction.

Historical upstream QA reports and development diaries remain available in Git history but are intentionally not treated as current product truth.