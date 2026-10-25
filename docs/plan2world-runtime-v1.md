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

Each floor contains its resolved elevation, compiled walkthrough start and room surfaces. An explicit native `walkthroughStart` is retained; otherwise the compiler selects a deterministic interior point from the same native room polygons/holes and offline clearance used by authoring diagnostics. Floors without a walkable room or authored point retain null. Godot selects an emitted point and never reconstructs a room centroid or repairs an invalid spawn. Room polygons and holes are compiled from native room analysis so a runtime backend never has to reproduce Plan2World room detection.

A native room with `floorOpening: true` is an aperture, not a walkable surface. It still participates in native nesting so an enclosing room receives that polygon as a hole, but the runtime compiler does not emit the opening as a second room surface. This prevents presentation or collision code from filling a stairwell/shaft after the hole was correctly detected.

Every emitted room surface must produce its compiler-owned floor collider.
An untriangulatable surface fails compilation with its floor and room IDs;
it is never silently omitted. Invalid or unresolved explicit native boundaries
also block export, including `floorOpening` boundaries whose omission would fill
an aperture. Native editing/JSON backup remains available so the author can
correct the source. Browser and CLI share this gate; the CLI fails before writing
artifacts and the browser reports the error without downloading a scene ZIP.
The compiler does not repair topology, fill holes or move spawn to hide a failure.

A room has `ceilingHeight: null` when the native boundary does not establish one uniform ceiling, when its native type is outdoor, or when it is an explicitly bounded ground surface. These follow native authoring presentation policy; matching heights on retained walls do not invent a roof over open ground. Backends must not invent a ceiling from that null value.

## Entities

The first contract carries only runtime-relevant native semantics:

- `wall`: exact straight/quadratic centreline, thickness, endpoint heights and boundary visibility;
- `door`: host association, dimensions, closed pose and type-specific interaction data;
- `window`: host association, dimensions and closed pose;
- `furniture`: semantic/catalog asset reference, transform and effective size;
- `column`;
- `stair`: authored footprint/type plus explicit traversal semantics.

IDs remain stable native/runtime references. Saved native room IDs are preserved; unsaved detected-room runtime IDs derive from the floor and sorted boundary wall IDs rather than transient editor timestamps. `floorId`, door `hostWallId`, stair `targetFloorId` and collider `ownerId` refer back to compiled runtime objects rather than engine nodes.

## Door interaction

Door motion is a discriminated contract. Backends switch on `interaction.kind` and must not infer a hinge, slide direction or animation from unrelated fields.

### `none`

Used for a leafless architectural opening. It has no dynamic door collider.

```json
{ "kind": "none" }
```

### Explicit door parts

Every non-opening interaction contains `leaves`. Each leaf has its own stable
`id`, `colliderId`, `assetRef`, `size` and `closedPose`. `size` is presentation
width/height/thickness in metres, independent of the referenced collider's shape.
The collider retains the native door as `ownerId`. The door's top-level dimensions
and `closedPose` describe the whole doorway, not an implied full-width moving body.
Leaf IDs use `door:<URI-encoded native ID>:leaf:<index>`; adapters never construct
IDs or divide the doorway width themselves.

### `swing`

Each leaf carries an explicit pivot, rotation axis and signed open angle. Pivots
are at floor elevation; the currently emitted axis is vertical. Axis-angle motion
follows the right-hand rule.

```json
{
  "kind": "swing",
  "leaves": [{
    "id": "door:entry:leaf:0",
    "colliderId": "door:entry:leaf:0",
    "assetRef": "builtin:door-leaf-v1",
    "size": [0.9, 2.1, 0.04],
    "closedPose": { "center": [2.0, 1.25, 0.0], "yawClockwiseRadians": 0 },
    "pivot": [2.45, 0.2, 0.0],
    "axis": [0, 1, 0],
    "openAngleRadians": 1.5707963267948966
  }]
}
```

`single` has one leaf. Native `double`/`french` doors compile to two equal leaves,
hinged at opposite jambs with opposite signed angles. `swingDirection` and `flipSide` jointly select their shared opening side, matching
the native two-leaf plan symbol. Changing either reverses both angles without
swapping part identities. On a single door, `swingDirection` selects the hinge. A paired door has one open/close state;
interacting with either leaf operates both, with animation input gated as a unit.

On a curved host, the wall aperture retains the native physical arc width. Leaf
centers, widths and pivots follow the chord between the same shared wall-path
opening endpoints. Engines must not substitute the curve's midpoint tangent or
place an additional full-width collider across the paired leaves.

### `slide`

Sliding/pocket interactions contain one leaf with `axis` (world-space unit vector)
and positive `travel` in metres. They have no pivot or swing angle. The compiler
maps the retained native left/right direction onto the opening chord until the
native authoring model gains a separate slide-direction semantic.

### `unsupported`

Bifold and garage doors retain `kind: "unsupported"`, `sourceMotion: "fold"` or
`"overhead"`, and an explicit closed leaf. That leaf has presentation and collision
references but no invented hinge, angle or slide axis. It remains a static closed
blocker and exposes no interaction target.

The entity retains `doorType`, `swingDirection` and `flipSide` as source semantics;
engines consume the discriminated interaction object for behavior. This update to
the experimental v1 contract requires re-exporting older derived runtime snapshots.
The native Project format is unchanged. Godot rejects old leafless motion objects
instead of silently omitting their collision or guessing a replacement.

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

The compiler emits a matching upward-wound `triangle-mesh` ramp collider. The ramp is intentionally a continuous physics surface: engines can use ordinary grounded character motion instead of needing engine-specific stair-step climbing heuristics. `riserCount` remains source semantics and is now also used by the shared presentation compiler to create deterministic straight-stair step geometry in `architecture.glb`.

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
- non-opening doors receive one explicit box collider per leaf; supported motion
  uses dynamic bodies while unsupported motion remains a static closed blocker;
- railings use their authored height/thickness for both boundary semantics and
  independently compiled presentation/collision; air stays invisible and collidable;
- windows do **not** create walk-through collision gaps;
- non-flat furniture gets a conservative box collider;
- columns get box/cylinder primitives.

Runtime backends translate these colliders into native physics types. Runtime triangles use right-handed CCW winding with +Y normals for walkable surfaces; Godot reverses triangle winding at its adapter boundary to match clockwise front faces. This conversion applies to physics and missing-GLB fallback presentation. They do not triangulate rooms, carve floor openings or infer stair ramps themselves.

## Schema and references

`schemas/plan2world-runtime-v1.schema.json` uses closed variants for every entity, collider, door-interaction and stair-traversal kind. Unknown fields are rejected rather than silently accepted. The collider union includes `box`, `cylinder` and static `triangle-mesh` variants.

JSON Schema cannot express all cross-object references, so compiler tests also assert that emitted floor IDs, entity IDs and collider IDs are unique and that door/collider references resolve to objects on the same floor. Stair compiler tests additionally cover adjacent-floor targets, authored elevations, upward triangle winding and unsupported cases.

## Rendering boundary

`plan2world-runtime-v1` owns semantics, interaction and physics geometry; it is not the canonical presentation mesh. `architecture.glb` is the sibling compiler-owned static presentation artifact shared by runtime backends.

The current package is:

```text
scene.json              # plan2world-runtime-v1 semantics, interaction, collision
architecture.glb        # compiler-owned static architecture + basic materials
scene.assets/manifest.json # plan2world-runtime-assets-v1
scene.assets/<sha256>.glb # referenced furniture and dynamic-door presentation
```

Railings are capped boundary extrusions at native dimensions, matching authoring
review. The native model does not specify balusters, handrails or infill; the
compiler does not invent them. Air boundaries emit no presentation mesh.

The presentation compiler composes the wall/room shell with static window panes, square/round columns and supported straight-stair step geometry. The GLB writer assigns a deterministic basic material palette and carries stable Plan2World ownership in node extras. Physics remains independent: engines must still use runtime JSON colliders rather than deriving collision from GLB.

A full-width, full-height aperture may consume its entire host wall. The wall
and opening keep their runtime IDs and semantics, but the mesher emits no wall
primitive when no solid surface remains. This is valid absence of presentation,
not an empty GLB mesh or a request for an adapter to reconstruct the wall. Door
leaves, window panes and collision remain independently compiled.

Dynamic door leaves and replaceable furniture remain outside `architecture.glb`. Their `assetRef` resolves through the sibling asset manifest, so model choice and transforms can change at runtime without rebuilding static architecture. See [Runtime assets](runtime-assets-v1.md). L/U/spiral stairs also remain outside shared presentation until their traversal semantics are intentionally specified; they are not faked as straight stairs.

Do not put Godot `.tscn`, Unity prefab or Unreal Actor details into the contract.
