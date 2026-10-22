# plan2world-runtime-v1

`plan2world-runtime-v1` is the engine-neutral handoff between the editable Plan2World `Project` and runtime backends such as Godot, Unity, Unreal or a future web runtime.

It is **not** an LLM output and it is **not** an authoring model. The native `Project` remains the editable source of truth. Runtime snapshots are disposable deterministic build artifacts.

## Pipeline

```text
source raster
  -> LLM evidence
  -> deterministic plan2world-draft-v1
  -> native editable Project
  -> deterministic runtime compiler
  -> plan2world-runtime-v1
  -> Godot / Unity / Unreal / Web adapter
```

Runtime adapters must not re-run room detection, reinterpret source evidence or repair architecture. Fix the earliest wrong Plan2World artifact and recompile.

## Coordinates

- units: metres;
- right-handed world;
- `+Y` is up;
- native plan `+X` maps to runtime `+X`;
- native plan `+Y` maps to runtime `+Z`;
- planar yaw values are radians, clockwise from `+X` in the native plan projection.

Adapters own any final engine-specific axis or quaternion conversion.

## Floors and room surfaces

Each floor contains its resolved elevation, optional walkthrough start and room surfaces. Room polygons and holes are compiled from the native room analysis so a runtime backend never has to reproduce Plan2World room detection.

A room may have `ceilingHeight: null` when the native boundary does not establish one uniform ceiling. Backends must not invent a ceiling from that null value.

## Entities

The first contract carries only runtime-relevant native semantics:

- `wall`: exact straight/quadratic centreline, thickness, endpoint heights and boundary visibility;
- `door`: host association, dimensions, closed pose and coarse interaction motion;
- `window`: host association, dimensions and closed pose;
- `furniture`: semantic/catalog asset reference, transform and effective size;
- `column`;
- `stair`.

Door interaction intentionally remains semantic. For example, `swing`, `slide`, `fold` and `overhead` do not prescribe a Godot node tree, Unity component or Unreal actor class.

## Collision

Collision is compiler-owned output rather than something each backend infers from render meshes.

- wall collision is faceted from the same wall path used by the application;
- door openings are removed from static wall collision;
- closed non-opening doors receive a dynamic leaf box collider;
- windows do **not** create walk-through collision gaps;
- non-flat furniture gets a conservative box collider;
- columns get box/cylinder primitives;
- stairs are emitted semantically but do not yet receive generated walkable collision in v1.

This is deliberate: runtime backends translate primitive colliders into their native physics types instead of implementing Plan2World geometry rules.

## Rendering boundary

`plan2world-runtime-v1` is currently a semantic/runtime contract, not a replacement 3D interchange format. A later compiler stage may package compiler-owned static geometry and PBR assets as glTF/GLB. That stage should be shared by all backends rather than letting each engine independently mesh walls, openings, floors and ceilings.

The intended package is therefore eventually:

```text
scene.json              # plan2world-runtime-v1 semantics, interaction, collision
architecture.glb        # compiler-owned static mesh + materials
assets/*.glb            # optional furniture/door assets
```

Do not put Godot `.tscn`, Unity prefab or Unreal Actor details into the contract.
