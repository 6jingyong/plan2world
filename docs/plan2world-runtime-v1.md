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

## Floors, room surfaces and apertures

Each floor contains its resolved elevation, optional walkthrough start and room surfaces. Room polygons and holes are compiled from native room analysis so a runtime backend never has to reproduce Plan2World room detection.

A native room with `floorOpening: true` is an aperture, not a walkable surface. It still participates in native nesting so an enclosing room receives that polygon as a hole, but the runtime compiler does not emit the opening as a second room surface. This prevents presentation or collision code from filling a stairwell/shaft after the hole was correctly detected.

A room may have `ceilingHeight: null` when the native boundary does not establish one uniform ceiling. Backends must not invent a ceiling from that null value.

## Entities

The first contract carries only runtime-relevant native semantics:

- `wall`: exact straight/quadratic centreline, thickness, endpoint heights and boundary visibility;
- `door`: host association, dimensions, closed pose and type-specific interaction data;
- `window`: host association, dimensions and closed pose;
- `furniture`: semantic/catalog asset reference, transform and effective size;
- `column`;
- `stair`: authored footprint/type plus explicit traversal semantics.

IDs remain stable native/runtime references. `floorId`, door `hostWallId`, stair `targetFloorId` and collider `ownerId` refer back to compiled runtime objects rather than engine nodes.

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

## Stair traversal

Stair traversal is also discriminated. Runtime adapters must consume `traversal` rather than deriving a destination floor or vertical shape from `stairType`, `riserCount`, Three.js geometry, or a render mesh.

For a native straight stair, the compiler resolves the adjacent authored floor from ordered floor levels: `direction: "up"` targets the next floor and `direction: "down"` targets the previous floor. Explicit floor elevations are authoritative. If level ordering and elevation direction disagree, the stair stays unsupported rather than silently reversing itself.

The native 2D UP/DN arrow also fixes which end of the footprint reaches the target. A supported straight stair receives:

```json
{
  "kind": "ramp",
  "targetFloorId": "floor-1",
  "startElevation": 0.0,
  "endElevation": 3.0
}
```

The compiler emits a matching upward-wound `triangle-mesh` ramp collider. The ramp is intentionally a continuous physics surface: engines can use ordinary grounded character motion instead of needing engine-specific stair-step climbing heuristics. `riserCount` remains source semantics and may later support higher-fidelity presentation.

L-shaped, U-shaped and spiral stairs are currently preserved as explicit unsupported traversal:

```json
{ "kind": "unsupported", "reason": "non-straight" }
```

Other unsupported reasons cover missing adjacent floors, contradictory target elevations and invalid native dimensions. Do not approximate those cases as straight ramps.

## Collision

Collision is compiler-owned output rather than something each backend infers from render meshes.

- room floors are deterministic upward-wound `triangle-mesh` surfaces with native room holes preserved;
- explicit `floorOpening` regions produce holes but never their own floor collider;
- supported straight stairs receive compiler-owned `triangle-mesh` ramps between authored floor elevations;
- wall collision is faceted from the same wall path used by the application;
- door openings are removed from static wall collision;
- closed non-opening doors receive a dynamic leaf box collider;
- windows do **not** create walk-through collision gaps;
- non-flat furniture gets a conservative box collider;
- columns get box/cylinder primitives.

Runtime backends translate these colliders into native physics types. They do not triangulate rooms, carve floor openings or infer stair ramps themselves.

## Schema and references

`schemas/plan2world-runtime-v1.schema.json` uses closed variants for every entity, collider, door-interaction and stair-traversal kind. Unknown fields are rejected rather than silently accepted. The collider union includes `box`, `cylinder` and static `triangle-mesh` variants.

JSON Schema cannot express all cross-object references, so compiler tests also assert that emitted floor IDs, entity IDs and collider IDs are unique and that door/collider references resolve to objects on the same floor. Stair compiler tests additionally cover adjacent-floor targets, authored elevations, upward triangle winding and unsupported cases.

## Rendering boundary

`plan2world-runtime-v1` owns semantics, interaction and physics geometry; it is not the canonical presentation mesh. `architecture.glb` is the sibling compiler-owned architectural presentation artifact shared by runtime backends.

The intended package is:

```text
scene.json              # plan2world-runtime-v1 semantics, interaction, collision
architecture.glb        # compiler-owned static architectural mesh + materials
assets/*.glb            # optional furniture/door assets
```

Straight-stair presentation is still a compatibility proxy in the current Godot adapter; the ramp collider is physics data, not a promise that `architecture.glb` contains stair artwork. Future stair presentation must remain derived from the same native/runtime semantics rather than becoming another source of truth.

Do not put Godot `.tscn`, Unity prefab or Unreal Actor details into the contract.
