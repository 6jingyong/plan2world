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

The shared artifact compiler also reserves each explicit door leaf's **closed**
collider volume against furniture effective boxes. The check uses authored yaw
and world height, includes flat/non-walking items, and allows touching faces.
Leafless passages have no reserved leaf. It does not infer or reserve a complete
swing envelope. A nearby chair may still stop live swing motion, but the saved
layout is clear when doors reopen in their default closed pose.

Godot previews reuse these emitted boxes as editor-only `Area3D` nodes on layer 4.
They are queried for placement together with world bodies, never for locomotion,
door animation, floor support or furniture picking. Static reservations survive
furniture-only updates; they do not follow the animated leaf. Shared compilation
remains the final authority for accepting an edit or exporting a scene. Invalid
externally saved Projects fail to open without destroying the active world;
internal native authoring and JSON backup remain available for correction.
Older compiled snapshots should be re-exported to execute the current rule.

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

## Local verification record

Implementation branch: `godot-product-editor`. Keep the scope at native house
walkthrough and furniture arrangement; these controls do not introduce a general
scene editor, scripting system or alternative canonical data model.

| Milestone | Evidence and conclusion |
| --- | --- |
| `ab865c3`: native cameras/layout | [Original results](../.plan2world-validation/runs/20261025-godot-plan-view/RESULTS.md). 1,665 unit tests, native mode separation/CRUD, packaged Linux and rendered inspection passed. The flat canvas prototype was removed. |
| `2582099`: entrance, loading and controls | [Product-control results](../.plan2world-validation/runs/20261025-product-controls/RESULTS.md). 1,670 unit tests; entrance/facing, transactions, no history and constrained controls passed. Frozen real-house replay retained all architecture/input bytes. Closed-pose doorway placement remained explicitly unresolved. |
| Current: door/layout lifecycle | [Current results](../.plan2world-validation/runs/20261025-door-layout-lifecycle/RESULTS.md). 1,684 unit tests passed. Shared export/CLI checks and native pointer/micro-adjustment reserve default closed poses; save/export/reopen and real walking are covered by the updated shipped-PCK gate. |

The latest round additionally fixes notice ownership: camera/toolbar refresh must
retain an operation's explanation until the next edit. A hidden top-view toolbar
must not reframe the world or cancel first-person adjustment. Its first negative
run caught the overwritten explanation. A second test waited for a camera tween
while the failed-open menu intentionally paused it; that test now waits for data,
asserts the paused retained world, explicitly resumes, then checks the animation
settles within the unchanged deadline. Negative logs remain in the run directory.
Historical implementation diaries stay in Git history; evidence and negative
results linked above remain available. No extraction prompt, source observation,
geometry correction, material or lighting change is part of this round.

### Remaining acceptance and limits

- GLB staging is synchronous; each accepted edit still recompiles a complete
  package in a new offline process and rebuilds furniture. Measure large-scene
  latency before choosing optimizations; subprocess cancellation/timeouts and
  crash recovery remain separate work.
- Closed-pose clearance does not promise that a door can complete its full live
  motion. Native physics may stop it on a player or nearby furniture. Old
  compiled snapshots require re-export; the engine does not rerun authoring
  validation or repair their source data.
- Floor support samples the center/corners of furniture against emitted floor
  collision; it does not certify continuous support under every footprint point.
- Wall attachment supports straight solid walls only. Legacy unbound items need
  explicit attachment; new model-file import is outside this scope.
- Wall selection lists authored IDs. In-world wall picking, HUD contrast on light
  backgrounds, material/lighting polish and target-device usability remain work.
  Missing-asset HUD aggregation is covered on initial load; edits introducing new
  missing models need live-status refresh.
- Linux headless/Mesa inspection and Windows cross-builds do not establish native
  Windows Forward+, physical controller, file-dialog or OS resize/DPI acceptance.
  Full three-engine browser/benchmark regressions and remote CI are unclaimed for
  unpublished local revisions. Complex stairs/special doors and optional
  low-yield observation experiments stay deferred. No GitHub writes are implied.
