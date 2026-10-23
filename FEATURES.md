# Plan2World capability reference

This is a current capability summary, not a development diary.

## Reconstruction

| Capability | Current behavior |
| --- | --- |
| Image reconstruction | `source-architecture-v1` + `source-furnishing-v1` → deterministic refinement/closure → `plan2world-draft-v1`. |
| Walls | Zero-width straight or quadratic centrelines; topology normalization is deterministic. |
| Doors/windows | Source endpoints are projected onto normalized walls; host IDs, width and position are program-derived. |
| Scale/registration | Scale evidence is converted deterministically; source registration comes from the same source-pixel transform and is strict when present. |
| Furniture | Current reconstruction uses the fixed `plan2world-furniture-v1` vocabulary and native `imported_object` blocks. |
| Open ground | `floorAreas` can represent visible open ground without fake closure walls. |
| Balcony policy | Recognized balconies/terraces default to independent enclosed glazed rooms unless source evidence triggers the guard. |

## Review and editing

- Valid drafts convert into the existing native `Project`/`Floor` model.
- Native wall/opening/furniture correction, Undo/Redo and persistence remain available.
- Imported-object blocks can be styled/replaced while retaining native identity.
- Rooms/areas are derived from live native geometry.
- Browser 2D, 1.20 m architectural cut and 3D review all consume the same native Project.
- Browser FPS/PointerLock movement has been removed. Orbit, 3D selection/editing, camera previews, floor stacks, cuts and native runtime-spawn editing remain available.

## Compiled runtime

- Native railings compile to shared GLB boundary presentation at authored height/thickness. Air boundaries remain invisible and collidable.
- `npm run runtime:export` reads an existing native Project without invoking AI or reopening the browser editor.
- One deterministic compilation boundary emits `plan2world-runtime-v1` plus a sibling `architecture.glb`.
- Runtime JSON owns engine-neutral semantics, collision and interaction/traversal contracts, including explicit triangulated room floors and straight-stair ramps.
- Native `floorOpening` regions remain compiler-owned apertures: they cut holes in enclosing room surfaces and are not re-emitted as floors that fill themselves.
- Outdoor rooms and explicitly bounded ground retain native no-ceiling semantics, even when retained walls share a height.
- `architecture.glb` owns deterministic static presentation geometry plus a small engine-neutral material palette.
- Straight and quadratic walls are meshed deterministically; curved openings keep quadratic `pathPosition` semantics while widths are applied in physical path distance.
- Compatible endpoint wall networks are mitered across L/T/X/collinear junctions and hidden endpoint caps are removed.
- Static window panes, square/round columns and traversable straight-stair step geometry are compiled into the same shared GLB instead of being rebuilt by Godot.
- The Godot adapter consumes the compiled artifacts without recomputing topology or deriving collision from GLB.
- Godot converts runtime CCW triangle winding to its clockwise convention and uses explicit runtime triangles for grounded `CharacterBody3D` motion, gravity and floor snapping. A real native-export walkthrough gate exercises collision, ray-based swing/slide interaction and stair ascent/descent.
- Straight UP/DN stairs resolve to the adjacent authored floor and receive a compiler-owned walkable ramp; L/U/spiral stairs remain explicit unsupported traversal.
- Single/double/french swing and sliding/pocket doors have explicit per-leaf `AnimatableBody3D` bodies and one interaction state per native door; unsupported fold/overhead motions remain explicit closed blockers instead of being faked as hinges.
- Runtime export packages referenced catalog/custom GLBs and a deterministic shared door leaf through `plan2world-runtime-assets-v1`. Godot instances use compiler-owned normalization, native effective sizes/rotation/mirroring and explicit door motion; only missing assets use proxies.
- When architecture GLB is present, Godot suppresses static wall/floor/window/column/stair proxies. Missing GLB still falls back to isolated compatibility presentation using compiler-owned collision triangles where available.

Representative runtime tests include `tests/runtime-scene.test.ts`, `tests/runtime-stair-traversal.test.ts`, `tests/runtime-static-architecture.test.ts`, `tests/runtime-godot-boundary.test.ts`, `tests/runtime-architecture-mesher.test.ts`, `tests/runtime-room-surface-mesher.test.ts`, `tests/runtime-architecture-glb.test.ts`, `tests/runtime-export-cli.test.ts`, `tests/runtime-assets.test.ts`, `tests/runtime-door-leaves.test.ts`, `tests/runtime-boundary-parity.test.ts` and the real Godot `runtime/godot/tests/runtime_assets_test.gd` gate. Focused browser regressions include `tests/browser/quick-geometry-correction.spec.ts`.

## Fresh validation policy

Runtime integration acceptance uses a normally saved real-house Project plus a separate authored complex scene; see [the acceptance recipe](docs/runtime-integration.md). Byte/ownership checks, real engine physics, inspected rendering and platform coverage are recorded separately.

Generated benchmark outputs are disposable run artifacts, not fixtures. Each rerun uses a new ignored `.plan2world-validation/runs/<run-id>/<sample-id>/` directory. Reconstruction input metadata contains no answer paths. Human references are isolated under `tests/evaluation/plan2world/source-references/` and are read only after fresh generation is frozen.

When something fails, fix the earliest responsible layer rather than hand-editing the output or compensating downstream.

## Known limits

- Schema validity and geometry health do not establish source-image accuracy.
- Hidden doors, dense service cores, watermarks and ambiguous boundaries may remain uncertain.
- Furniture acceptance is semantic presence/type/broad position, not exact product geometry.
- Registration consistency is not visual correctness.
- Wall junctions with incompatible endpoint heights or unbounded/pathological offset intersections retain closed caps and emit a mesher diagnostic rather than being repaired.
- Native furniture finish/tint mapping and richer authored door models remain deferred.
- L-shaped, U-shaped and spiral stairs do not yet receive shared GLB presentation or traversal; those variants remain explicit unsupported semantics rather than receiving a fake straight ramp.
- Stairwell apertures must exist in the native Project as `floorOpening`; the runtime preserves them but does not invent them from stair footprints.
- Bifold and garage/overhead door animation is not implemented; those leaves stay closed blockers.
- Plan2World is not BIM, structural analysis or photorealistic reconstruction.
