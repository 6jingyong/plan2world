# Runtime migration status

The core architecture migration is implemented locally. Native Windows CI
execution, Windows Forward+ hardware acceptance and the final publication checks
remain outstanding. Complex stairs and unsupported door mechanisms are deferred.

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
| Desktop lifecycle | Focus-loss pause and held-action clearing; explicit resume; manual return to compiled spawn with reset velocity/view and preserved world/door state |

See [runtime contracts](plan2world-runtime-v1.md), [assets](runtime-assets-v1.md),
[delivery](runtime-delivery.md) and the [Godot guide](../runtime/godot/README.md).

## Verification already performed

- Latest desktop milestone: 1,622 unit tests, type checks and production build;
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
  Windows native CI is defined; its workflow/PowerShell syntax and installer were
  checked locally, but the Windows job itself has not run. The Windows player was
  cross-built, not executed on Windows. Phone profiles are viewports, not hardware.

These checks span the implementation milestones; they are not a claim that the
entire main-level suite ran again on the latest commit. Follow the
[integration acceptance recipe](runtime-integration.md) for the final revision.
Local acceptance records and the current downloads are indexed under the ignored
`.plan2world-validation/README.md`. Intermediate builds/traces are disposable;
retain native inputs, canonical results, hashes and representative inspected views.

## Next priorities

1. Execute the native Windows CI gate after explicit authorization to publish.
   Verify Windows asset loading, grounded traversal, desktop lifecycle and the
   relocated player/scene package on Windows itself.
2. Perform Windows Forward+ hardware/manual acceptance: renderer/driver startup,
   mouse/focus behavior, doors, stairs and real-project presentation/collision.
3. Run full main-level regression on the final revision, consolidate migration
   review, then update umbrella PR #62 as the final architecture migration when
   the user requests GitHub publication. No push, dispatch, PR update or merge is
   implicit in local completion.
4. Review the existing three low-severity audit findings in a separate dependency
   upgrade pass. The configured high-severity audit gate passed.

Furniture interaction/movement, richer authored model/material styling, lighting
and other experience features are subsequent product work. Furniture currently
supports presentation, transform and collision; it has no interaction/movement FSM.

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
