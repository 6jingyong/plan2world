# Native Godot furniture layout

The desktop product uses one Godot 3D world for first-person exploration and
furniture layout from above. The browser remains an internal reconstruction,
architecture-editing and review tool; it is not required in a delivered player.
The native Plan2World `Project` remains the saved source of truth.

## Controls and scope

| First person | Top view |
| --- | --- |
| WASD / left stick move; right stick or mouse looks | Visible pointer selects and drags furniture |
| E / gamepad A interacts with doors | First-person movement/look/door actions are disabled |
| F / gamepad X focuses furniture within 2.5m | Middle/right drag pans; wheel zooms |
| Arrows tap 1cm; hold / left stick adjusts up to 8cm/s | Ground items stay on their floor; mounted items follow their wall |
| F / Enter / A places; Esc / B cancels the preview | Esc cancels a furniture preview |
| F2 / gamepad Y switches view | Same camera transition returns to the existing player pose |

During first-person furniture adjustment, locomotion and door actions stop.
Mouse/right-stick input controls look only; it never drags furniture. Floor
movement follows the view heading in native X/Y (Godot X/Z), with fixed height.
Mounted-item left/right follows the authored wall; up/down changes installation
height within that wall. A cancelled preview was never an accepted edit.

F1 opens the scene menu. Focus loss pauses, clears held movement and cancels
previews in either mode; explicit resume returns to that mode. A release over
a toolbar ends the gesture. The top-view floor selector hides other authored
floors and ceilings for inspection, without removing their physics or changing
source geometry. Fit floor includes wall tops and the native toolbar inset.

Furniture-only editing supports add, move, clockwise 90-degree rotation,
replacement, removal, **Save Project** (native JSON with retained model
attachments) and **Export scene** (the existing runtime ZIP). Architecture, door
semantics, floors, holes and stairs are fixed. The catalog offers existing built-in
furniture and custom models already retained in the Project; importing new model
files and arbitrary rotation controls are outside this milestone. Native locks
remain enforced. Compiled scenes opened without their source Project allow
read-only top view; choose **Open editable Project** to edit native JSON or a
Project package ZIP. Unsaved changes require an explicit discard before opening
another source/scene or closing the app.

There is no product Undo/Redo, operation log or retained edit history. Only the
current native Project is saved, including furniture positions, rotation, asset
identity and explicit wall binding. Browser internal authoring keeps its own undo.
Wall-mounted catalog items require a chosen straight solid wall, side and bottom
height. Curved-wall attachment is explicitly unsupported; existing unbound wall
items stay visible/selectable but cannot be moved until explicitly attached.

## Ownership

`layout_camera.gd` owns a native Camera3D transition, ray picking, pan/zoom, drag
preview and Godot shape queries. The transition interpolates within the same
world; it does not teleport the player or recreate doors. Player processing is
suspended during layout/transitions. Physics stays active for spatial queries
unless the scene menu or focus loss pauses it. Furniture edits replace only the
furniture subtree, preserving architecture, player and door state.

Selection Areas use emitted furniture effective sizes on a separate physics
layer. They are editor targets, not walking collision. Preview moves the actual
loaded model; physics is committed only after the edit succeeds. Placement
queries use the compiler's box collider against the current Godot world, excluding
the selected item's old collider and room floor surfaces. Wall/door/furniture/
player overlaps are rejected without committing a state. Non-colliding native
markers remain selectable and do not acquire mesh-derived physics. No additional
room containment/topology inference is performed. Ground support uses the
compiler-owned floor collision, including holes; the adapter does not infer
rooms. Wall frames and blocked door/window rectangles come from the compiler.
Door animation checks native physics before advancing its explicit leaf pose;
an obstruction stops motion without penetrating furniture or the player.

`layout_session.gd` delegates native data edits to a separate, offline shared core:

```text
Godot native UI/gesture
  → engine-neutral furniture command (native centimetres/degrees)
  → applyFurnitureLayoutCommand(native Project clone)
  → existing compileRuntimeArtifacts + runtime package serializer
  → isolated candidate
  → Godot validates placement against native physics
  → replace current Project and consume compiled furniture artifacts
```

`core/layout-core.cjs` bundles existing pure TypeScript model/validation/package/
compiler code. `core/node` or `core/node.exe` is a pinned, checksum-verified Node
24.19.0 x64 runtime bundled with the player; `core/models` reuses the existing GLBs
and attribution. No browser, HTML, WebView, AI or server is used. Node handles data
and compilation, never Godot UI, animation, ray picking or collision decisions.
Candidates are staged in `user://layout-sessions`; the original input is never
automatically overwritten. Acceptance deletes the previous private state;
rejection deletes the candidate. Closing releases the private directory while
keeping explicitly saved Projects. Save/export writes a temporary sibling and
renames it into place; failure retains dirty state and the existing destination.
There is no persistent editor-session recovery.

## Entrance and loading lifecycle

The internal authoring entrance picker stores one explicit Project main door and
its inward side: `floor.entrance = {doorId, side: "left" | "right"}`. The compiler
emits an interior offset and inward-facing yaw. Export rejects missing floor
clearance or a blocked anchor instead of moving it to a convenient location.
Furniture edits must preserve this entrance clearance. Old Projects without a
marked door retain their legacy explicit/automatic start, which export also
validates. There is no largest-door heuristic in Godot.

Loading validates the consumer contract and the optional compiler GLB SHA-256,
then constructs resources, presentation and collision outside the active tree.
Only a complete candidate replaces the world and editable source; a failed load
retains both. Missing assets use explicit compatibility proxies. A present GLB
with a mismatched digest is rejected. Re-export old derived snapshots when their
required furniture/door contract predates this version.

Native Project compilation runs in the offline worker; GLB import/node staging
remains synchronous. Large-scene loading progress/background resource preparation
is a future performance task. Transactional replacement does not promise
nonblocking imports.

`runtime_artifacts.gd` and `runtime_loader.gd` continue to consume compiled
artifacts only. Neither imports native Project data, constructs topology, computes
asset bounds, triangulates rooms or creates presentation geometry. The importer
registers Godot's official `GLTFDocumentExtensionConvertImporterMesh`, ensuring
runtime GLBs instantiate renderable MeshInstance3D nodes with ownership extras.
`.tscn` remains adapter composition, never a canonical scene representation.

## Develop and verify

Build the offline core once, then point the development Godot process at it:

```bash
node tooling/build-layout-core.mjs /tmp/p2w-core
export P2W_AUTHORING_CORE=/tmp/p2w-core
Godot_v4.7.2-stable_linux.x86_64 --path runtime/godot
```

Normal player builds include this core automatically; no environment setting or
user Node installation is needed. Build-time Node downloads are pinned and
verified; runtime operations use only local files.

The real-engine gates are `runtime_launcher_test.gd` (camera interpolation,
mode-specific input, floor switch, pan/zoom, focus/menu recovery and preserved
player/door/world state) and `runtime_layout_test.gd` (native Project entry,
asset-backed CRUD, ray drag, native units, collision rejection, save,
export and reopen). `runtime_assets_test.gd` also requires renderable imported
meshes and preserved ownership. The relocated delivery test runs these against
the exported PCK and shipped core from UTF-8 paths containing spaces, then boots
the actual release executable. With a real display, the layout gate additionally
captures native top view, drag preview, camera transition and first person.
`runtime_product_controls_test.gd` adds entrance/facing, malformed JSON and wrong
GLB recovery, unsupported floor/hole placement, interrupted drag, actual keyboard
and virtual-gamepad input, wall-bound movement, obstruction and save-failure tests.
It runs against the shipped PCK/core in both platform delivery jobs.

Local milestone evidence is recorded under
`.plan2world-validation/runs/20261025-godot-plan-view/`. Failed flat-view and framing
iterations are retained there as historical evidence; the flattened plan canvas
is absent from production code. Linux software-rendered inspection and headless
physics do not establish Windows Forward+ hardware acceptance. No GitHub
publication or remote CI run is implied by local completion.

## Previous local milestone — ab865c3 (2026-10-25)

Baseline: main `89a4fab`; implementation branch: `godot-product-editor`.

| Check | Result |
| --- | --- |
| Full deterministic unit suite | 190 files / 1,665 tests passed, single worker |
| Type/Svelte check | 0 errors, 0 warnings |
| Production build | Passed |
| Chromium package/custom-model workflows | 11 passed, including desktop/phone viewport and native package return |
| Actual Godot 4.7.2 | GLB assets/ownership, demo, grounded walkthrough, native camera/input and furniture editing passed |
| Relocated Linux player ZIP | Exported PCK + shipped core editing/lifecycle/physics passed; actual release executable boot passed |
| Native rendered inspection | Exported PCK, GL Compatibility/Mesa software renderer; top view, real-model drag, transition and first person inspected |
| Windows player | Verified-Node cross-build passed on Linux; this editor revision has no native Windows or Forward+ hardware result yet |
| Audit at configured high threshold | Passed; existing 3 low-severity SvelteKit-related findings remain |

The first parallel unit run had two 5-second CLI timeouts while rendering/export
jobs competed for CPU; the complete single-worker rerun passed unchanged assertions.
The flattened plan-canvas prototype was rejected and removed. Early framing
iterations clipped the house, then used a transient 1,178px toolbar height before
Godot container layout settled; deferred framing now uses the final 117px inset.
A shipped-PCK assertion initially compared logical viewport coordinates to the
headless physical window size; it now checks the actual logical viewport. The
framing constraint was retained. Negative logs and original fixture inputs remain
in the ignored evidence directory, alongside final hashes and screenshots.

Cleanup removes the superseded flat renderer, avoids browser-store/UI imports in
the shared data core, deletes unused response projections, updates obsolete runtime
handoff instructions, and reclaims private/abandoned edit revisions. Existing
missing-asset/GLB compatibility remains intentional. Reconstruction experiments,
source observations and their separate working branch are unchanged. No image
extraction rerun, full three-engine browser suite, benchmark or GitHub publication
is claimed for this product-editor milestone.


## Current local milestone — entrance, transaction and product controls

Baseline: `ab865c3`; branch: `godot-product-editor`. The four agreed changes are
implemented locally: authored main-door spawn/facing with export clearance,
isolated load/replace, no product undo/history, and separate pointer layout versus
keyboard/gamepad micro-adjustment constrained to floor or explicit wall frames.
Browser internal authoring undo remains. New derived snapshots require the current
furniture movement contract; native Projects/packages remain the source.

| Validation | Actual scope/result |
| --- | --- |
| Full deterministic suite | 191 files / 1,670 tests passed, isolated single worker |
| Type/Svelte check; production build | Passed; 0 type/Svelte errors or warnings |
| Chromium workflows | Package/custom-model/scene export and entrance authoring; desktop and phone viewports |
| Exact exported Linux PCK + bundled core | Launcher, grounded traversal/doors, layout CRUD/save/reopen and product-control gates passed from relocated ZIPs |
| Native rendered inspection | Same exported PCK; top view, attachment toolbar, floor/wall micro-adjustment; Linux Mesa/GL Compatibility |
| Frozen real-house Project | E10 saved native input: 50 walls, 40 semantic furniture; normal export/open, one deliberate 1cm furniture move, save/export and grounded short walkthrough passed; architecture and original input bytes unchanged |
| Missing presentation | Real-house generic semantic furniture correctly remains 40 proxies with an explicit HUD notice; no guessed style/asset substitution |
| Windows | Final player cross-built with verified Node; native Windows CI/hardware has not run for this unpublished revision |

Evidence, final binaries, source/artifact hashes and negative logs are under
[the current run](../.plan2world-validation/runs/20261025-product-controls/RESULTS.md).
The real-house replay is runtime/editor acceptance of a frozen saved Project,
not a new AI extraction experiment or a claim of improved image quality. Its
unmarked legacy spawn is preserved; marked-door behavior is separately tested.

Failed iterations remain inspectable: the first consumer gate compared JSON
numeric array types too strictly; spawn yaw was initially applied twice; a floor
ray's exclusion append updated a property copy; virtual input needed the actual
Input event pipeline; test fixture coordinates touched a wall; new test fixture
TS types needed correction. These were corrected without weakening assertions.
A full unit run competing with rendering/packaging exceeded one existing 5s CLI
deadline; the isolated full rerun passed with the same timeout and assertions.

### Remaining acceptance and limits

- Door obstruction is fixed for live animation. Furniture can still occupy an
  open doorway; reopening the saved layout starts doors closed. Shared export/
  placement rules must explicitly resolve that default-pose conflict before
  treating the broader door/layout lifecycle as complete.
- GLB staging is synchronous; each accepted edit still recompiles a complete
  package in a new offline process and rebuilds furniture. Large-scene latency,
  subprocess cancellation/timeouts and crash recovery remain separate work.
- Floor support uses center/corner samples against emitted floor collision; it
  does not certify continuous support under every point of a large footprint.
- New wall attachment supports straight solid walls only. Legacy unbound items
  need explicit attachment; new model-file import is outside this scope.
- Wall selection currently lists authored IDs. In-world wall picking, HUD
  contrast on light backgrounds, material/lighting polish and target-device
  usability need further acceptance. Missing-asset HUD aggregation is covered on
  initial load; edits introducing new missing models need live-status refresh.
- Real gamepad hardware, Windows Forward+, native file-dialog/OS resize/DPI paths,
  full three-engine browser/benchmark regressions and publication are unclaimed.
  Complex stairs/special doors and optional low-yield observation experiments
  remain deferred. No GitHub push, PR or merge is part of this local milestone.
