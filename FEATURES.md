# Plan2World capability reference

This is a current capability summary, not a development diary.

## Reconstruction

| Capability | Current behavior |
| --- | --- |
| Image reconstruction | `source-wall-trace-v1` → deterministic Bare House → `source-annotation-v1` → deterministic `plan2world-draft-v1`. |
| Walls | Zero-width straight or quadratic centrelines; topology normalization is deterministic. |
| Doors/windows | Source endpoints are projected onto normalized walls; host IDs, width and position are program-derived. |
| Scale/registration | Scale evidence is converted deterministically; source registration comes from the same source-pixel transform and is strict when present. |
| Furniture | Current reconstruction uses the fixed `plan2world-furniture-v1` vocabulary and native `imported_object` blocks. |
| Open ground | `floorAreas` can represent visible open ground without fake closure walls. |
| Balcony policy | Recognized balconies/terraces default to independent enclosed glazed rooms unless source evidence triggers the guard. |

## Review, editing and runtime

- Valid drafts convert into the existing native `Project`/`Floor` model.
- Native wall/opening/furniture correction, Undo/Redo and persistence remain available.
- Imported-object blocks can be styled/replaced while retaining native identity.
- Rooms/areas are derived from live native geometry.
- The same geometry feeds 2D, 1.20 m architectural cut, 3D and first-person walkthrough.

Representative tests include `tests/plan2world-draft.test.ts`, `tests/plan2world-reconstruction-assembly.test.ts`, `tests/imported-objects.test.ts`, `tests/browser/imported-object-editing.spec.ts`, `tests/browser/quick-geometry-correction.spec.ts` and `tests/browser/walkthrough.spec.ts`.

## Fresh validation policy

Generated benchmark outputs are disposable run artifacts, not fixtures. Each rerun uses a new ignored `.plan2world-validation/runs/<run-id>/<sample-id>/` directory. Reconstruction input metadata contains no answer paths. Human references are isolated under `tests/evaluation/plan2world/source-references/` and are read only after fresh generation is frozen.

When something fails, fix the earliest responsible layer rather than hand-editing the output or compensating downstream.

## Known limits

- Schema validity and geometry health do not establish source-image accuracy.
- Hidden doors, dense service cores, watermarks and ambiguous boundaries may remain uncertain.
- Furniture acceptance is semantic presence/type/broad position, not exact product geometry.
- Registration consistency is not visual correctness.
- Plan2World is not BIM, structural analysis or photorealistic reconstruction.
