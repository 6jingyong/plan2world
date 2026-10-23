# Runtime migration status and verification

The native Project is authoring truth. Browser: authoring, correction, review and
quick previews. Shared deterministic compilation: runtime semantics/collision,
architecture GLB and packaged dynamic assets. Godot: the actual runtime.

## Completed stages

- Stage A (#78): content-addressed catalog/custom GLBs, stable asset identity,
  compiler-owned fit transforms, dynamic door leaves, isolated missing-asset fallback.
- Stage B: remove PointerLock/FPS input, browser motion/collision stepping and
  walkthrough UI/tests. Preserve orbit, selection/editing, camera previews, floor
  stacks/cuts and the native `walkthroughStart` authoring field. Retain only offline
  floor clearance/segment sampling for native source/connectivity diagnostics.
- Godot walkthrough prerequisite: convert CCW runtime triangles to Godot clockwise
  winding for physics/fallback display; use engine input actions and actual grounded
  motion. Compiler selects default interior spawn; engine does not infer it.

## Required local verification for this milestone

1. `npm run check`, `npm test`, `NODE_ENV=production npm run build`, catalog check
   and dependency audit. Compiler tests include deterministic automatic spawn;
   native spawn edits remain undoable and never move review/photo cameras.
2. Pinned SHA-verified Godot 4.7.2: project parse/import, built-in demo, asset gate,
   and `runtime_walkthrough_test.gd` using `runtime-walkthrough-fixture.mjs`.
   The walkthrough uses exported native geometry, loaded assets, real physics and
   ray interaction, including nonzero elevations, a curved exterior wall, windows,
   furniture, columns, an authored aperture, and stair ascent/descent.
3. Browser regression: native opening selection/height edits in 3D at desktop/phone
   sizes, cut/stack framing, live geometry edits and Undo/Redo, inspector viewport,
   camera preview, import/save/reload, resources and idle rendering. Retired FPS
   controls have no browser test substitute; actual gameplay belongs to Godot tests.
4. Inspect captured browser screenshots separately from mechanical pass results.
   Unit/engine assertions do not establish visual quality or a manually reviewed
   real-project walkthrough.

## Next: Stage C native parity

- L/U/spiral stairs stay unsupported. Native type/width/depth/riserCount/direction
  alone do not specify turn handedness, landing geometry, U-gap or spiral inner
  radius/turn angle. Extend the native/compiled semantic contract before generating
  traversal geometry; do not copy a decorative mesh as physics truth.
- Double/french doors still have the existing single-leaf interaction contract.
  Introduce explicit leaf poses/pivots/motion/colliders before implementing two-leaf
  behavior. Fold/overhead require intentional mechanisms and remain blockers.
- Audit railing and other native boundaries. Air boundaries stay invisible but
  collidable; native semantics must survive mesher/collider changes unchanged.
- For each supported variant: deterministic semantics/geometry tests first, then
  real Godot motion/collision/presentation checks. Unsupported variants stay explicit.

## Final Stage D

Clean obsolete paths/docs and use a real saved native Project for a reviewed
Project → CLI export → Godot walkthrough covering curves, openings, furniture,
holes, stairs, floor elevations, spawn and GLB/runtime ownership. Run main-level
browser/benchmark regressions locally. Publishing or preparing the final
`runtime-v2 → main` PR requires an explicit user request; never merge implicitly.

## Reference applied

[img2threejs architecture](https://github.com/img2threejs/img2threejs/blob/main/docs/ARCHITECTURE.md)
provides a useful verification pattern: measurable geometry/structure gates before
render review, scoped passes and compact reusable evidence. Plan2World retains its
own observation/compiler/engine ownership; generated Three.js runtime hierarchies
and vision-based acceptance are not substituted for native semantic contracts.
