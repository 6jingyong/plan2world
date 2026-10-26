# Plan presentation and ceiling lights

The current renderer reference and measured before/after results are documented
in [lighting calibration](runtime-lighting-calibration.md). Native photometric
settings stay authoritative; view exposure and natural presets are session state.

Godot uses the same world, colliders and camera transition for walkthrough and
orthographic arrangement. Plan appearance is a native material/view profile,
not an embedded browser or a second 2D scene model.

## Plan appearance

`runtime_view_style.gd` applies unlit materials, dark wall footprints, pale floors
and explicit orange door / blue window bands. Sun, fixture lights, shadow casting
and SSAO are disabled in plan mode. Walking restores the retained PBR materials
and the chosen natural-light preset. Physics, doors and the Project are unchanged.
Temporary selection/snap overlays are outside the material restoration cache.

Opening bands are compiled by `planOpeningMesher.ts` into `architecture.glb`.
Their node extras retain owner/floor IDs plus `view: "plan"`; their kinds are
`plan-door` / `plan-window`. They follow the shared physical-width wall path,
including authored curves, and sit above lintels so aperture locations remain
readable. They are presentation only: no new colliders and no animation truth.
Engines hide these nodes in walkthrough; Godot does not mesh or infer openings.
Re-export older scenes to obtain these bands; the compatibility proxy is not a
second plan compiler.

## Native attachment and light contract

The existing ceiling-light, recessed-light, pendant and chandelier catalog IDs
form **Ceiling Lights**. All require an explicit native ceiling boundary:

```json
{
  "ceilingMount": { "wallIds": ["north", "east", "south", "west"] },
  "light": { "enabled": true, "lumens": 1100, "temperatureKelvin": 4000 }
}
```

Wall IDs bind an existing native enclosure without persisting detected-room
timestamps or inventing another room model. Shared native analysis supplies the
same horizontal ceiling policy as architecture compilation. Missing/open/outdoor
ceilings and nonuniform wall tops are unsupported. Lights cannot span holes or
leave their chosen ceiling. The shared command verifies the full rotated
footprint; engine preview checks emitted floor support and native physics.

The compiler emits `movement.kind: "ceiling"` with `roomId` and absolute ceiling
`elevation`. The fixture centre is ceiling elevation minus half its effective
height. Runtime rooms expose `ceilingWallIds` for explicit UI selection. Old
unbound ceiling catalog items need a native attachment; they are never silently
rendered as floor lamps or assigned a guessed ceiling.

`RuntimeFurnitureEntity.light` carries kind (`omni` / `spot`), enabled state,
luminous flux, source temperature, derived RGB, range, cone angle, local source
position and local direction. The compiler emits a downward direction; adapters
consume it, rather than infer a beam from the model. The current Godot reference
exposure maps 800 lm to energy 1; this is an experience renderer, not calibrated
photometric analysis. Natural presets are artistic day/night/sunrise/sunset
settings, not a geolocated solar simulation.

Four deterministic unit GLBs reuse the existing asset manifest and normalization
boundary. Lamp meshes are dynamic assets, never baked into architecture GLB.
Asset emitter materials are presentation only; actual Light3D nodes come from
runtime semantics. Asset-embedded lights do not define runtime lighting. Changing
brightness/temperature leaves architecture, model bytes and collision unchanged.

## Editing and persistence

- The top-left layer selector chooses Furniture or Ceiling lights. Only that
  layer's furniture is visible/pickable in plan mode; walking physics is retained.
- The ceiling catalog is restricted to the four supported fixtures. Placement
  requires choosing the authored ceiling. Grid snapping preserves ceiling height;
  there is no automatic wall-mount or ceiling reassignment.
- First-person F / gamepad X uses native ray picking. Arrows / left stick move a
  fixture in its ceiling plane only. Real light nodes follow pending poses and
  return when cancelled; accepted poses save through the shared native command.
- L (or the selected-light button in plan) opens a native light dialog. It cancels
  any unplaced movement, pauses the world, and applies enabled/flux/temperature
  atomically through the shared `light` command. Failure retains current data.
- T or the walking HUD selector changes natural light. This is session view
  state retained across camera switches and furniture edits, not saved Project
  state. Lamp pose, host, enabled state, lumens and temperature are saved/exported.
- There is no Undo/Redo or operation history. Material restoration caches only
  temporary renderer state, not user edits.

Internal browser review also respects an explicit ceiling binding when positioning
its existing lightweight tokens. It does not acquire runtime input or physics.

## Verification

Deterministic tests cover mounting/height, holes, invalid ceilings, native/package
round trips, stable assets, photometric state and curved/straight opening markers.
`runtime_plan_lighting_test.gd` exercises the native layer/catalog/dialog, real
pointer dragging, collision and aperture rejection, first-person ray/key controls,
light preview/cancel/save/reopen, natural modes and plan/walk restoration against
the shipped PCK/core. With a real display it samples rendered floor pixels to
verify actual illumination and colour changes, and captures every natural mode.
Headless assertions alone do not establish lighting appearance or GPU quality.

![Unlit plan presentation](images/godot-layout.png)

![Separate ceiling editing layer](images/godot-ceiling-layer.png)

![Night with warm ceiling light](images/godot-lighting-night.png)

![Same floor under a cool ceiling light](images/godot-lighting-cool.png)
