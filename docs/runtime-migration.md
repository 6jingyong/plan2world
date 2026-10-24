# Runtime migration status and verification

The native Project is authoring truth. Browser: authoring, correction, review and
quick previews. Shared deterministic compilation: runtime semantics/collision,
architecture GLB and packaged dynamic assets. Godot: the actual runtime.

Offline delivery now uses the same compiler from the editor/CLI to produce
portable scene ZIPs, plus separate standalone Windows/Linux player ZIPs. The
player adds scene selection, paused menu/resume and world replacement. See
[runtime delivery](runtime-delivery.md) for build commands, exported-PCK/release
verification and the outstanding Windows hardware acceptance boundary.

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

## Stage C native parity

- L/U/spiral stairs stay unsupported. Native type/width/depth/riserCount/direction
  alone do not specify turn handedness, landing geometry, U-gap or spiral inner
  radius/turn angle. Extend the native/compiled semantic contract before generating
  traversal geometry; do not copy a decorative mesh as physics truth.
- Completed: all non-opening doors emit explicit leaf parts with stable IDs,
  asset/collider references, closed poses, sizes and discriminated motion.
  Double/french doors have two equal jamb-hinged leaves sharing one interaction
  state. Either physical leaf routes ray interaction to that state. Single/slide/
  pocket use the same part contract. Fold/overhead stay explicit closed blockers.
- Completed: railing boundaries now have shared GLB extrusion at authored height
  and thickness; they no longer disappear when static proxies are suppressed.
  No baluster/handrail data is inferred. Air remains invisible and collidable.
- Curved-host door leaves fit the physical opening endpoint chord while the wall
  aperture retains native arc width. Collision and presentation remain separately
  emitted; adapters do not split door geometry or infer pivots from model bounds.
- Verification: deterministic compiler/unit/schema checks; pinned Godot asset fit,
  independent physical leaves and shared state; actual ray opening/closing through
  either paired leaf, closed collision and open passage, native railing/air blockers,
  existing grounding/single/slide/stair traversal gates. The bundled demo is rebuilt
  from the native walkthrough fixture and checked for exact compiler reproduction.
- Re-export older runtime snapshots: the experimental v1 door interaction now
  requires explicit leaf parts. Native saved Projects are unchanged. No legacy
  single-leaf inference path is retained in the engine.

## Stage D integration

- The Wikimedia two-bedroom downstream baseline was imported, saved and downloaded
  through the normal editor. That unchanged native Project then passed CLI export
  and an actual Godot walkthrough: compiled spawn, grounding, paired door operation
  and passage to the porch, and full-height window collision. All 47 static GLB
  nodes resolve to native owners; dynamic leaves load separately with no proxies.
  Repeated JSON/GLB exports and asset manifests are byte-stable and packaged asset
  digests match. This is a saved real-house baseline, not an AI extraction result.
- That house does not contain furniture, curved walls or stairs. The separately
  authored native walkthrough scene covers catalog/custom furniture, curved walls,
  windows, columns, floor apertures, straight stairs, nonzero multi-floor elevations
  and railing/air boundaries through the same compiler and engine. Rendered views
  were inspected alongside the grounded physics/interaction gates.
- Integration exposed a compiler parity bug: uniform retained wall heights could
  invent ceilings over outdoor rooms or explicit ground boundaries. Those now
  retain native no-ceiling semantics, with deterministic tests preserving floor
  and wall collision. The successful Godot HUD shows the Project name and controls;
  artifact paths remain available in console diagnostics.
- Browser verification uses the production build, isolated mock-provider ports
  and composited canvas pixels for idle WebGL review. It retains the existing
  viewport/color/occlusion requirements rather than requiring an idle renderer to
  preserve its drawing buffer. The onboarding expectation follows the current
  editor/review controls.

Follow the [acceptance recipe](runtime-integration.md) for core/pinned-engine gates,
complete browser and benchmark regressions, saved input, ownership/hash checks and
local evidence. Render review was performed on Linux GL Compatibility with Mesa
software rendering; Windows Forward+ and manual hardware checks remain separate.
Publishing or preparing the final `runtime-v2 → main` PR requires an explicit user
request; never merge implicitly.

## Reference applied

[img2threejs architecture](https://github.com/img2threejs/img2threejs/blob/main/docs/ARCHITECTURE.md)
provides a useful verification pattern: measurable geometry/structure gates before
render review, scoped passes and compact reusable evidence. Plan2World retains its
own observation/compiler/engine ownership; generated Three.js runtime hierarchies
and vision-based acceptance are not substituted for native semantic contracts.

## Remaining native contracts

The parity audit intentionally leaves these explicit limitations:

| Native feature | Missing semantics / next prerequisite |
| --- | --- |
| L stair | Turn handedness, two flight lengths/widths, landing dimensions and travel endpoints |
| U stair | Turn handedness, separate flights, landing and inner gap dimensions |
| Spiral stair | Inner/outer walking radii, rotation direction, turn angle and entrance/exit bearings |
| Bifold | Panel count/widths, fold direction, hinge chain and track constraints |
| Garage / overhead | Section/track geometry and lifting mechanism; the native type alone does not select one |

Do not add runtime-specific guesses for these fields. Their next implementation
must start with a native authoring/editing/persistence contract, followed by shared
compiler semantics and deterministic geometry, then adapter motion/physics tests.
