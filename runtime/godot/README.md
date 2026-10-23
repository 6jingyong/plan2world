# Plan2World Godot runtime

This directory is a deliberately small consumer of `plan2world-runtime-v1` plus its sibling `architecture.glb` presentation artifact.
It is **not** a second authoring model and must never become the source of truth for a house.
The editable Plan2World `Project` remains authoritative; this runtime only consumes compiled artifacts.

## Target

- Godot 4.7.2 stable (Standard build is sufficient)
- Desktop Forward+ renderer
- Windows is the first manual test target

Core CI uses the pinned official Godot 4.7.2 Linux build, verifies its SHA-256 checksum, imports/parses this project headlessly, boots the built-in runtime demo, then checks native-export asset placement and a real grounded walkthrough. A runtime/GDScript change is not considered merge-ready if that gate fails.

## Run the built-in demo

1. Install Godot 4.7.2.
2. Open `runtime/godot/project.godot`.
3. Press **F6/F5** to run the project.
4. Controls:
   - `WASD`: move
   - `Ctrl`: slow walk
   - default: normal walk
   - `Shift`: fast walk
   - mouse: look
   - `E`: interact with a swing or sliding door
   - `Esc`: release/capture mouse

The default scene is `demo/runtime-scene.json`, so the runtime can still be tested without the web app, AI service, or external GLB. The demo includes grounded room floors, single/double/french swing and slide doors, native railing/air boundaries and a compiler-owned straight-stair ramp to an upper landing. When no architecture GLB is present, `runtime_proxy_renderer.gd` supplies compatibility visuals only; those meshes are not canonical presentation data.

## Compile an existing native Plan2World project

If you already have a saved native Project JSON, there is no need to reopen the editor, import the source image, or configure an LLM.

From the repository root:

```powershell
npm ci
npm run runtime:export -- "C:\path\house.project.json" "C:\path\house.runtime.json"
```

The CLI emits sibling artifacts from one deterministic compilation path:

```text
house.runtime.json        # semantics, collision, interaction
house.architecture.glb    # shared static presentation geometry + materials
house.assets/manifest.json # plan2world-runtime-assets-v1
house.assets/<sha256>.glb  # immutable furniture / door-leaf presentation
```

The runtime output path is optional. Without it, `house.project.json` becomes `house.project.runtime.json`, with `house.project.architecture.glb` beside it. A third argument can explicitly choose the GLB path.

The CLI reads the native file through `readProject()` and then uses the shared `compileRuntimeArtifacts()` boundary:

```text
native Project
  -> compileRuntimeScene()
  -> plan2world-runtime-v1
  -> compileArchitecturePresentation()
       -> wall/room shell mesh
       -> static windows/columns/straight stairs
  -> architecture.glb
```

No AI or network service is invoked, and there is no browser-only runtime exporter.

## Load an external runtime scene

From a terminal, pass the compiled runtime JSON after Godot's `--` separator:

```powershell
Godot_v4.7.2-stable_win64.exe --path runtime/godot -- --scene "C:\path\house.runtime.json"
```

Godot automatically looks for `house.architecture.glb` beside `house.runtime.json`. You can override that path explicitly:

```powershell
Godot_v4.7.2-stable_win64.exe --path runtime/godot -- --scene "C:\path\house.runtime.json" --architecture "C:\path\custom.architecture.glb"
```

Both `--scene=<path>` and `--architecture=<path>` are accepted.

## Runtime boundary

Godot consumes the artifacts for different jobs:

- `architecture.glb`: shared static presentation geometry and deterministic basic PBR materials;
- sibling `.assets/manifest.json` and content-addressed GLBs: existing catalog models, verified custom-model attachments and a shared default door leaf;
- `plan2world-runtime-v1`: player spawn/profile, collision, doors, windows, furniture and interaction/traversal semantics.

Collision is always generated from runtime JSON, never inferred from GLB. Room polygons are deterministically triangulated by the runtime compiler into `triangle-mesh` floor colliders with canonical +Y winding. Native `floorOpening` regions remain holes and are not emitted as replacement floor surfaces. Supported straight stairs are also compiled into explicit upward-wound triangle ramps between adjacent authored floor elevations. Godot converts their canonical CCW winding to its clockwise face convention and consumes them as `ConcavePolygonShape3D` rather than deriving them from presentation geometry.

The architecture presentation compiler owns straight and quadratic solid/railing boundary tessellation, physical-width openings on curved paths, compatible endpoint-network miters, room slabs/ceilings, static window panes, square/round columns and step presentation for traversable straight stairs. The GLB writer also assigns a small deterministic material palette. Godot only imports the finished static scene; it does not reconstruct any of that geometry.

When GLB is loaded successfully, compatibility wall/floor/window/column/stair presentation is suppressed. Furniture and door asset instances also suppress their own proxies independently. Furniture is visible even when its native height excludes it from collision. If GLB is absent, the fallback renderer reuses runtime colliders and compiler-owned triangle meshes where possible; it does not re-triangulate room polygons or infer stair geometry from authoring data.

The scripts are intentionally split by responsibility:

- `runtime_artifacts.gd`: command-line paths, runtime JSON/asset manifest gates, digest verification and external GLB import;
- `runtime_asset_renderer.gd`: normalized furniture/door asset instances using emitted semantics, with door presentation attached to loader-owned physics nodes;
- `runtime_loader.gd`: runtime semantics -> Godot collision and interaction nodes;
- `runtime_proxy_renderer.gd`: compatibility presentation only for missing architecture GLB or missing assets;
- `player.gd` / `door.gd`: engine-side runtime behavior;
- `main.gd`: thin orchestration, spawn and demo shell.

The adapter delegates engine work to Godot:

- player body: grounded `CharacterBody3D` with project gravity, floor snapping and `move_and_slide()`;
- collision: runtime-v1 boxes/cylinders/triangle meshes -> Godot `CollisionShape3D`;
- static architecture display: runtime-loaded glTF 2.0 binary via `GLTFDocument`/`GLTFState`;
- interactive swing and slide doors: one `door.gd` controller per native door, with one `AnimatableBody3D` per explicit moving leaf; ray targets delegate to that controller;
- straight-stair traversal: ordinary grounded movement over compiler-owned ramp collision;
- mouse look and movement speeds live only in the runtime backend.

No Plan2World wall topology, room detection, floor-hole inference, stair-target resolution, geometry repair, or AI reconstruction is recomputed here.

## Deliberate limitations

This is still an architecture/runtime milestone, not a rendering-quality milestone.

- `kind: "swing"` and `kind: "slide"` doors are interactive; fold and overhead source motions remain closed blockers;
- single/double/french swing doors consume explicit per-leaf pivots, poses and colliders; both paired leaves share one interaction state;
- straight stairs can connect adjacent authored floors physically and now have shared step presentation; L-shaped, U-shaped and spiral stairs remain explicit unsupported traversal/presentation rather than being approximated;
- a multi-floor stairwell still needs the native project to contain the corresponding `floorOpening` aperture; the runtime compiler will preserve it but will not invent one;
- wall junctions with incompatible endpoint heights or pathological/unbounded offset intersections retain closed caps and emit a compiler diagnostic;
- default door presentation is intentionally a simple shared GLB leaf; richer models/handles and authored door asset selection remain deferred;
- furniture with no actual catalog/custom asset (including semantic `imported_object` blocks) uses a compatibility proxy; sourceCategory is never guessed into a replacement catalog model;
- custom model sources must be the existing supported static, self-contained GLB profile; invalid/corrupt sources fail export, and missing sources are diagnosed;
- the material palette is intentionally generic and not yet sourced from native finishes/textures.

## Adapter boundary

The authoring source of truth is still the native Plan2World `Project`.
Godot must not import native `Project`, `plan2world-draft-v1`, LLM observations, Three.js nodes, or Godot scene data back into the core model.

Future backends (Unity/Unreal/Web) should consume the same runtime JSON + presentation geometry boundary rather than translating from this Godot project.

## Asset integration gate

The Godot CI job exports `tooling/runtime-asset-fixture.mjs` through the real CLI,
then runs `tests/runtime_assets_test.gd` in the pinned engine. It checks actual
imported vertices against emitted effective dimensions/centers, native mirrors,
nonzero floor elevation, catalog and textured custom models, no-collider low
furniture, single/paired swing and slide/pocket physics attachment and motion, unsupported blockers,
leafless openings, missing-file handling and duplicate-proxy suppression.

```sh
node tooling/runtime-asset-fixture.mjs /tmp/runtime-assets
Godot_v4.7.2-stable_linux.x86_64 --headless --path runtime/godot --script res://tests/runtime_assets_test.gd -- --scene /tmp/runtime-assets/assets.runtime.json
```

Transfer the runtime JSON, architecture GLB and sibling `.assets` directory together.
The asset directory follows the runtime JSON basename, independently of an explicit
`--architecture` override. No engine-specific paths are stored in either JSON contract.

## Grounded walkthrough gate

```sh
node tooling/runtime-walkthrough-fixture.mjs /tmp/runtime-walkthrough
Godot_v4.7.2-stable_linux.x86_64 --headless --fixed-fps 60 --path runtime/godot --script res://tests/runtime_walkthrough_test.gd -- --scene /tmp/runtime-walkthrough/walkthrough.runtime.json
```

This starts from native Project JSON, runs the real exporter and loads both the
architecture GLB and dynamic model package. It drives the actual player through
Godot input actions and physics frames: floor contact at nonzero elevation, wall,
furniture and round-column collision, ray-based single/paired swing and slide
interaction through either paired leaf, railing and invisible air blockers, the
native stairwell aperture, ascent to an upper landing and descent to the lower
floor. `--fixed-fps 60` accelerates deterministic simulation without bypassing
`CharacterBody3D`, gravity, raycasts or `move_and_slide()`.

Physical keys are bound through Godot's `move_*` input actions. The runtime compiler
owns default interior spawn selection. Scenes without a compiled point display
an explicit missing-spawn status instead of the engine inventing a location.

Re-export older derived snapshots that relied on engine-side automatic spawn or
implicit single-leaf door motion. The artifact gate rejects missing leaf contracts.
The native Project format and saved spawn field are unchanged.

The bundled JSON is generated from the same native fixture. Regenerate it with
`node tooling/runtime-demo.mjs`; do not hand-edit it. A unit test verifies exact
compiler reproduction. It intentionally omits GLBs to exercise missing-artifact
compatibility; the export gates above test the complete presentation package.
