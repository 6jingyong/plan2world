# Runtime migration status

The baseline architecture/delivery migration reached main in PR #79. Native Godot
top-view and furniture-only editing are the current local product milestone.
Windows Forward+ hardware acceptance, richer presentation and deferred native
mechanisms remain separate work.

## Architecture and completed scope

```text
Floorplan raster → AI observations → deterministic reconstruction
  → native editable Project → deterministic runtime compiler
  → runtime JSON + architecture GLB + packaged dynamic assets → Godot
```

The native `Project` is authoring truth. Runtime JSON owns semantics, explicit
collision, interaction/traversal and player profile. Architecture GLB owns static
presentation; content-addressed model assets own furniture and dynamic door-leaf
presentation. Godot consumes these outputs without reconstructing topology,
triangulating rooms, inferring stair targets or deriving collision from meshes.
Godot scenes are adapter composition, never canonical authoring data.

| Area | Implemented behavior |
| --- | --- |
| Shared compiler | Stable IDs, floor/room semantics, explicit colliders and compiled spawn; deterministic JSON, GLB and asset packaging |
| Architecture | Straight/quadratic walls, physical-width openings, junction miters, floor slabs, ceilings, authored holes, windows, columns, straight stair steps, native railing/air semantics and no-ceiling policy |
| Dynamic presentation | Catalog/custom GLBs and shared door asset; compiler-owned fit/size/rotation/mirroring; independently owned collision; genuine missing-asset proxies |
| Godot runtime | Grounded first-person movement, gravity, floor snap, collision, swing/slide/pocket doors, real double/french leaves and straight multi-floor stair traversal |
| Browser boundary | Legacy PointerLock/FPS, movement collision and runtime door state removed; orbit, review/editing/selection, quick camera preview, floor stacks/cuts and native spawn editing retained |
| Offline delivery | Shared browser/CLI scene ZIP export; Windows/Linux player builds; scene picker, pause/resume, scene replacement and failed-open recovery |
| Native layout | Same-world cameras/input, native placement, furniture-only commands without history, default closed-door clearance, save/export through the bundled shared core |
| Desktop lifecycle | Focus-loss pause and held-action clearing; explicit resume; manual return to compiled spawn with reset velocity/view and preserved world/door state |

See [runtime contracts](plan2world-runtime-v1.md), [assets](runtime-assets-v1.md),
[delivery](runtime-delivery.md) and the [Godot guide](../runtime/godot/README.md).

## Earlier baseline verification

- Earlier desktop milestone: 1,622 unit tests, type checks and production build;
  pinned Godot 4.7.2 exported-PCK lifecycle/grounded-walkthrough gates, actual Linux
  release boot without console stdout, Linux/Windows cross-builds, and Linux
  rendered input/focus/return-to-start inspection.
- Delivery milestone: 22 focused browser cases, covering all three engines,
  desktop/phone-sized scene export, exact browser/CLI ZIP equality and failed
  asset-request retry, plus existing authoring/package regressions.
- Integration milestone: 1,293 browser cases across Chromium/Firefox/WebKit and
  six benchmark cases; normally saved real-house native Project → CLI export →
  Godot walkthrough; byte stability, asset digests and GLB/native ownership.
- The real house covers spawn, grounding, paired doors and full-height window
  collision. A separate authored native scene covers curved walls, catalog/custom
  furniture, columns, floor holes, straight stairs, multi-floor elevations and
  railing/air. This validates downstream native-Project runtime behavior, not AI
  image-extraction accuracy.
- Rendered acceptance used Linux GL Compatibility/Mesa software rendering.
  Those earlier local Windows checks were cross-builds and installer checks.
  Baseline PR #79 subsequently passed native Windows/Linux headless main CI;
  this new unpublished furniture-editor milestone still needs its own remote run.
  Phone profiles are viewports, not hardware.

These checks span the implementation milestones; they are not a claim that the
entire main-level suite ran again on the latest commit. Follow the
[integration acceptance recipe](runtime-integration.md) for the final revision.
Local acceptance records and the current downloads are indexed under the ignored
`.plan2world-validation/README.md`. Intermediate builds/traces are disposable;
retain native inputs, canonical results, hashes and representative inspected views.

## Next priorities

1. Continue real-house acceptance and product hardening: measure large-scene import/edit latency and
   improve wall-picking/HUD clarity. Native mode separation, no-history editing,
   entrance contracts, closed-door layout clearance and transactional loading have local engine coverage; see
   [layout ownership and results](godot-furniture-layout.md).
2. On explicit publication, run the updated native Linux/Windows CI and full
   main-level regressions for this new milestone. Do not push or merge by default.
3. Perform Windows Forward+ hardware/manual acceptance on the target machine.
4. Improve materials, lighting and layout usability using real-house feedback.
   Complex stairs remain low priority; furniture gameplay/animation and new custom
   model import are not part of the current furniture arrangement scope.

Earlier milestone verification above is historical. The baseline main CI passed
Linux/Windows headless checks; it does not validate this unpublished editor change
or Windows graphics/input hardware. PR #62 is no longer the current migration
handoff; use the completed baseline and the new product milestone scope.

## Deferred native parity

Unsupported semantics remain explicit. They must not be disguised as working
straight ramps or swing doors, and do not block the agreed baseline migration.

| Feature | Required upstream authoring/semantic contract |
| --- | --- |
| L stair | Turn handedness, separate flights, landing dimensions and travel endpoints |
| U stair | Turn handedness, separate flights, landing and inner gap dimensions |
| Spiral stair | Inner/outer walking radii, rotation direction, turn angle and entry/exit bearings |
| Bifold door | Panel count/widths, fold direction, hinge chain and track constraints |
| Garage/overhead | Section/track geometry and lifting mechanism |

Add these native editing/persistence fields before compiler geometry or engine
behavior. Re-export older derived runtime snapshots that predate the explicit
leaf contract; native saved Projects remain unchanged.
