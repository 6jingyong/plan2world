# Plan2World Godot runtime spike

This directory is a deliberately small consumer of `plan2world-runtime-v1`.
It is **not** a second authoring model and must never become the source of truth for a house.
The editable Plan2World `Project` remains authoritative; this viewer only consumes compiled runtime snapshots.

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

The default scene is `demo/runtime-scene.json`, so the Godot spike can be tested without the web app or any AI service.

## Compile an existing native Plan2World project

If you already have a saved native Project JSON, there is no need to reopen the editor, import the source image, or configure an LLM.

From the repository root:

```powershell
npm ci
npm run runtime:export -- "C:\path\house.project.json" "C:\path\house.runtime.json"
```

The output path is optional. Without it, `house.project.json` becomes `house.project.runtime.json` in the same directory.

The CLI reads the native file through the existing `readProject()` path and compiles it through the same deterministic `compileRuntimeScene()` used by the app and unit tests. It contains no second conversion implementation and invokes no AI or network service.

A browser helper remains available as an alternative:

1. Run `npm run dev`.
2. Open `/runtime-export`.
3. Upload the same native Plan2World JSON export.
4. Download the generated `*.runtime.json` file.

## Load an external runtime scene

From a terminal, pass the compiled runtime JSON after Godot's `--` separator:

```powershell
Godot_v4.7.2-stable_win64.exe --path runtime/godot -- --scene "C:\path\house.runtime.json"
```

`--scene=<path>` is also accepted.

The shortest no-AI validation path is therefore:

```text
existing native Project JSON
  -> npm run runtime:export
  -> plan2world-runtime-v1 JSON
  -> Godot --scene
```

## What the spike proves

The adapter intentionally delegates engine work to Godot:

- player body: `CharacterBody3D`
- wall/furniture collision: `StaticBody3D` + primitive `CollisionShape3D`
- interactive swing door: `AnimatableBody3D`
- sliding along walls and collision response: `move_and_slide()`
- mouse look and three movement speeds live only in the runtime backend

No Plan2World wall topology or room detection is recomputed here. The runtime compiler has already resolved those semantics.

## Deliberate limitations

This is a runtime architecture spike, not a rendering-quality milestone.

- only `kind: "swing"` doors are interactive; slide and unsupported motions remain closed blockers
- double/french swing doors are represented as one leaf for now
- wall visuals are debug proxies derived from primitive colliders; windows are translucent markers and are not visually cut through those proxies yet
- room floor polygons are rendered without subtracting polygon holes
- stairs are not yet physical
- player motion is planar and holds the current floor elevation; gravity/floor-body traversal is deferred
- furniture uses collider-sized proxy boxes; GLB asset resolution is deferred
- materials and lighting are intentionally basic

These constraints keep the experiment focused on the question that motivated `runtime-v2`: can a mature engine replace Plan2World's hand-written walkthrough/physics infrastructure without contaminating the core data model?

## Adapter boundary

The only supported input is `plan2world-runtime-v1`.
Do not import native `Project`, `plan2world-draft-v1`, LLM observations, Three.js nodes, or Godot scene data across this boundary.

Future backends (Unity/Unreal/Web) should consume the same runtime contract rather than translating from this Godot project.
