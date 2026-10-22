# plan2world-runtime-v1

`plan2world-runtime-v1` is the engine-neutral runtime IR between the editable Plan2World `Project` and runtime backends such as Godot, Unity, Unreal or a future web runtime.

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
- planar `yawClockwiseRadians` values are radians clockwise from `+X` in the native plan projection;
- axis-angle motion fields use the standard right-hand rule around their explicit axis.

Adapters own any final engine-specific axis or quaternion conversion.

## Floors and room surfaces

Each floor contains its resolved elevation, optional walkthrough start and room surfaces. Room polygons and holes are compiled from native room analysis so a runtime backend never has to reproduce Plan2World room detection.

A room may have `ceilingHeight: null` when the native boundary does not establish one uniform ceiling. Backends must not invent a ceiling from that null value.

## Entities

The first contract carries only runtime-relevant native semantics:

- `wall`: exact straight/quadratic centreline, thickness, endpoint heights and boundary visibility;
- `door`: host association, dimensions, closed pose and type-specific interaction data;
- `window`: host association, dimensions and closed pose;
- `furniture`: semantic/catalog asset reference, transform and effective size;
- `column`;
- `stair`.

IDs remain stable native/runtime references. `floorId`, door `hostWallId` and collider `ownerId` refer back to compiled runtime objects rather than engine nodes.

## Door interaction

Door motion is a discriminated contract. Backends switch on `interaction.kind` and must not infer a hinge, slide direction or animation from unrelated fields.

### `none`

Used for a leafless architectural opening. It has no dynamic door collider.

```json
{ "kind": "none" }
```

### `swing`

A swing door carries an explicit pivot point, rotation axis and signed open angle. The pivot is emitted on the hinge axis at floor elevation; the axis is currently vertical. `openAngleRadians` follows the right-hand rule around `axis`.

```json
{
  "kind": "swing",
  "pivot": [2.5, 0.2, 0.0],
  "axis": [0, 1, 0],
  "openAngleRadians": 1.5707963267948966
}
```

### `slide`

Sliding and pocket doors carry a world-space travel axis and positive travel distance. The current native model has no dedicated slide-direction field, so the compiler deterministically maps the retained native left/right direction onto the wall tangent until the authoring model gains a more specific semantic.

```json
{
  "kind": "slide",
  "axis": [1, 0, 0],
  "travel": 0.9
}
```

### `unsupported`

Native door types whose runtime mechanics are not yet specified do not receive fake swing/slide fields. Bifold and garage doors are preserved explicitly as unsupported motion semantics:

```json
{ "kind": "unsupported", "sourceMotion": "fold" }
{ "kind": "unsupported", "sourceMotion": "overhead" }
```

Adapters should keep those leaves as closed blockers until they implement an intentional behavior.

The door entity still retains `doorType`, `swingDirection` and `flipSide` as source semantics during this transition, but interaction behavior must come from the discriminated `interaction` object.

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

## Schema and references

`schemas/plan2world-runtime-v1.schema.json` uses closed variants for every entity, collider and door-interaction kind. Unknown fields are rejected rather than silently accepted.

JSON Schema cannot express all cross-object references, so compiler tests also assert that emitted floor IDs, entity IDs and collider IDs are unique and that door/collider references resolve to objects on the same floor.

## Rendering boundary

`plan2world-runtime-v1` is currently a semantic/runtime contract, not a replacement 3D interchange format. A later compiler stage may package compiler-owned static geometry and PBR assets as glTF/GLB. That stage should be shared by all backends rather than letting each engine independently mesh walls, openings, floors and ceilings.

The intended package is therefore eventually:

```text
scene.json              # plan2world-runtime-v1 semantics, interaction, collision
architecture.glb        # compiler-owned static mesh + materials
assets/*.glb            # optional furniture/door assets
```

Do not put Godot `.tscn`, Unity prefab or Unreal Actor details into the contract.
