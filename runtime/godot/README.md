# Plan2World Godot runtime spike

This directory is a deliberately small consumer of `plan2world-runtime-v1` plus its sibling `architecture.glb` presentation artifact.
It is **not** a second authoring model and must never become the source of truth for a house.
The editable Plan2World `Project` remains authoritative; this viewer only consumes compiled runtime artifacts.

## Target

- Godot 4.7.2 stable (Standard build is sufficient)
- Desktop Forward+ renderer
- Windows is the first manual test target

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
   - `E`: interact with a swing door
   - `Esc`: release/capture mouse

The default scene is `demo/runtime-scene.json`, so the Godot spike can still be tested without the web app, AI service, or external GLB. When no architecture GLB is present the runtime falls back to its old proxy visuals.

## Compile an existing native Plan2World project

If you already have a saved native Project JSON, there is no need to reopen the editor, import the source image, or configure an LLM.

From the repository root:

```powershell
npm ci
npm run runtime:export -- "C:\path\house.project.json" "C:\path\house.runtime.json"
```

The CLI now emits two sibling artifacts from the same deterministic compilation path:

```text
house.runtime.json        # semantics, collision, interaction
house.architecture.glb    # presentation geometry
```

The runtime output path is optional. Without it, `house.project.json` becomes `house.project.runtime.json`, with `house.project.architecture.glb` beside it. A third argument can explicitly choose the GLB path.

The CLI reads the native file through `readProject()` and then uses one shared `compileRuntimeArtifacts()` boundary:

```text
native Project
  -> compileRuntimeScene()
  -> plan2world-runtime-v1
  -> compileArchitectureMesh()
  -> architecture.glb
```

No AI or network service is invoked, and there is no browser-only converter anymore.

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

The shortest no-AI validation path is therefore:

```text
existing native Project JSON
  -> npm run runtime:export
  -> runtime JSON + architecture GLB
  -> Godot --scene
```

## Runtime boundary

Godot consumes the two artifacts for different jobs:

- `architecture.glb`: walls plus room floor/ceiling presentation geometry
- `plan2world-runtime-v1`: player spawn/profile, collision, doors, windows, furniture and interaction semantics

When the GLB loads successfully, the runtime loader stops drawing duplicate wall boxes and room-floor debug meshes. Collision remains generated from runtime JSON, while door leaves, window markers, furniture and columns remain semantic/runtime proxies until their own asset pipeline exists.

The adapter intentionally delegates engine work to Godot:

- player body: `CharacterBody3D`
- collision: runtime-v1 primitives -> Godot `CollisionShape3D`
- architecture display: runtime-loaded glTF 2.0 binary via `GLTFDocument`/`GLTFState`
- interactive swing door: `AnimatableBody3D`
- sliding along walls and collision response: `move_and_slide()`
- mouse look and three movement speeds live only in the runtime backend

No Plan2World wall topology or room detection is recomputed here. The runtime compiler and architecture mesher have already resolved those semantics.

## Deliberate limitations

This is still an architecture/runtime milestone, not a rendering-quality milestone.

- only `kind: "swing"` doors are interactive; slide and unsupported motions remain closed blockers
- double/french swing doors are represented as one leaf for now
- curved walls are still reported by the architecture mesher as unsupported
- wall junction/miter cleanup is not implemented yet
- door/window leaves and panes remain Godot proxy geometry; GLB currently owns the surrounding architectural openings
- stairs are not yet physical
- player motion is planar and holds the current floor elevation; gravity/floor-body traversal is deferred
- furniture uses collider-sized proxy boxes; furniture GLB asset resolution is deferred
- materials and lighting are intentionally basic

## Adapter boundary

The authoring source of truth is still the native Plan2World `Project`.
Godot must not import native `Project`, `plan2world-draft-v1`, LLM observations, Three.js nodes, or Godot scene data back into the core model.

Future backends (Unity/Unreal/Web) should consume the same runtime JSON + presentation geometry boundary rather than translating from this Godot project.
