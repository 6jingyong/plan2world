# Native Godot furniture layout

The desktop product uses one Godot 3D world for first-person exploration and
furniture layout from above. The browser remains an internal reconstruction,
architecture-editing and review tool; it is not required in a delivered player.
The native Plan2World `Project` remains the saved source of truth.

## Controls and scope

| First person | Top view |
| --- | --- |
| Captured mouse controls look | Visible pointer selects/drags furniture |
| WASD / Ctrl / Shift move the grounded player | Middle/right drag pans; wheel zooms |
| E interacts with doors | First-person movement/look/E are disabled |
| Esc releases/captures pointer | Esc cancels a furniture drag |
| F2 enters top view | F2 returns to the existing player camera/pose |

F1 opens the scene menu. Focus loss pauses, clears held movement and cancels
previews in either mode; explicit resume returns to that mode. A release over
a toolbar ends the gesture. The top-view floor selector hides other authored
floors and ceilings for inspection, without removing their physics or changing
source geometry. Fit floor includes wall tops and the native toolbar inset.

Furniture-only editing supports add, move, clockwise 90-degree rotation,
replacement, removal, undo/redo, **Save Project** (native JSON with retained model
attachments) and **Export scene** (the existing runtime ZIP). Architecture, door
semantics, floors, holes and stairs are fixed. The catalog offers existing built-in
furniture and custom models already retained in the Project; importing new model
files and arbitrary rotation controls are outside this milestone. Native locks
remain enforced. Compiled scenes opened without their source Project allow
read-only top view; choose **Open editable Project** to edit native JSON or a
Project package ZIP. Unsaved changes require an explicit discard before opening
another source/scene or closing the app.

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
player overlaps are rejected without committing a revision. Non-colliding native
markers remain selectable and do not acquire mesh-derived physics. No additional
room containment/topology inference is performed.

`layout_session.gd` delegates native data edits to a separate, offline shared core:

```text
Godot native UI/gesture
  → engine-neutral furniture command (native centimetres/degrees)
  → applyFurnitureLayoutCommand(native Project clone)
  → existing compileRuntimeArtifacts + runtime package serializer
  → immutable candidate revision
  → Godot validates placement against native physics
  → commit Project revision and consume compiled furniture artifacts
```

`core/layout-core.cjs` bundles existing pure TypeScript model/validation/package/
compiler code. `core/node` or `core/node.exe` is a pinned, checksum-verified Node
24.19.0 x64 runtime bundled with the player; `core/models` reuses the existing GLBs
and attribution. No browser, HTML, WebView, AI or server is used. Node handles data
and compilation, never Godot UI, animation, ray picking or collision decisions.
New revisions are staged in `user://layout-sessions`; the original input is never
automatically overwritten. Undo history is limited to 50 in-session revisions.
Evicted/abandoned revisions and rejected candidates are deleted; closing releases
the private session directory while keeping explicitly saved Projects. There is
no persistent editor-session recovery or cross-session undo yet.

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
asset-backed CRUD, ray drag, native units, collision rejection, undo/redo, save,
export and reopen). `runtime_assets_test.gd` also requires renderable imported
meshes and preserved ownership. The relocated delivery test runs these against
the exported PCK and shipped core from UTF-8 paths containing spaces, then boots
the actual release executable. With a real display, the layout gate additionally
captures native top view, drag preview, camera transition and first person.

Local milestone evidence is recorded under
`.plan2world-validation/runs/20261025-godot-plan-view/`. Failed flat-view and framing
iterations are retained there as historical evidence; the flattened plan canvas
is absent from production code. Linux software-rendered inspection and headless
physics do not establish Windows Forward+ hardware acceptance. No GitHub
publication or remote CI run is implied by local completion.

## Local milestone record — 2026-10-25

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
