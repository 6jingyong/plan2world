# Plan2World semantic white-model contract

Version: `plan2world-draft-v1`  
Presentation: `semantic-white-model`  
Furniture vocabulary: `plan2world-furniture-v1`  
Architectural component vocabulary: `plan2world-components-v2`

All world lengths are centimetres. The draft describes the architectural shell,
hosted openings, optional source semantics and lightweight furniture placeholders.
Native rooms are derived from wall topology; the draft does not author room polygons.

## Reconstruction invariant

Geometry is reconstructed before room-use semantics or furniture:

**wall network -> closed room envelopes -> hosted doors/windows -> optional components -> furniture**

A logical wall remains continuous across its openings. A room side may be mostly or
entirely window/door while still using one continuous host wall. Whether a source
space is called balcony, bedroom or anything else does not decide its geometry.

## Root fields

Required for current reconstruction:

- `schemaVersion: "plan2world-draft-v1"`
- `presentation: "semantic-white-model"`
- `furnitureVocabulary: "plan2world-furniture-v1"`
- `name`
- `units: "cm"`
- `scale`
- `floors`

When any architectural component is present, also require
`componentVocabulary: "plan2world-components-v2"`.

`scale.mode` is `measured`, `provided` or `estimated`; confidence is 0..1.
`assumptions` records uncertainty and presentation defaults.

## Walls

Each wall requires `id`, `start`, `end`; optional `curvePoint`, `kind`, positive
`thickness`/`height`, and confidence are supported. Image extraction should usually
omit physical thickness/height unless established. Normalization supplies editable
defaults (currently 280 cm height, 20 cm exterior thickness, 12 cm otherwise).

Walls are zero-width centreline paths during reconstruction. A visible smooth curve
uses one quadratic `curvePoint` where appropriate. Shared walls are emitted once.

## Doors and windows

Each opening requires:

- unique `id`;
- existing `wallId`;
- `position` from 0..1 along the logical host;
- positive physical `width`.

Openings have no independent thickness. The logical host remains continuous. A
full-wall window or full-wall sliding door is valid: its interval may reach both
host endpoints.

Door `type` may be `single`, `double`, `sliding` or `opening` when supported by
source evidence. A wide/multi-panel sliding system remains one `sliding` aperture
when its track/panel evidence describes one access opening.

Omitted window height/sill use the semantic-white-model presentation default of
floor-to-ceiling fixed glass. This is editable presentation, not a source claim.

Read [opening-trace.md](opening-trace.md) for source-pixel endpoint derivation and
the local bare-room envelope gate.

## Furniture

Current image reconstruction requires:

- `id`;
- `catalogId: "imported_object"`;
- exact fixed-vocabulary `sourceCategory`;
- approximate centre `position`;
- optional confidence.

Omit source-unknown size, rotation and styling. The runtime supplies editable
placeholder defaults. Architectural shapes are not furniture.

## Architectural components

`floors[].components` records optional source semantics that are not naturally
owned by furniture arrays. Each component has a unique `id`, exact fixed `type`,
approximate cm `position`, optional confidence, optional same-floor `geometryRefs`,
and stair-only `vertical` evidence.

Components never author scene policy. Do not emit `render`, `visible`,
`sceneEffect`, `sceneSupport`, `requiresNativeSupport` or equivalents. The fixed
registry decides `ignore`, `existing-geometry` or `unsupported` behavior.

A component label is not geometry authority. In particular, `balcony` is optional
evidence-only semantics: adding/removing that label must not change room closure,
walls, windows, doors, floor, collision or native room detection.

A sealed `shaft` may reference its visible enclosure walls while its hidden cavity
creates no dedicated mesh/floor hole. Visible `column`, `stair`, `floor_void`,
built-in `planter` and standalone `railing` remain deterministic support gaps until
native handlers exist.

The local `component-review.json` sidecar is evidence only; see
[component-review.md](component-review.md).

## Source registration and scale

Source registration uses existing wall endpoints and normalized coordinates on the
unchanged original raster. Prefer 3–6 spread-out reliable anchors; 2 is minimum.
Do not use furniture, text, dimension arrows or page corners.

Printed dimensions and dimension-chain subdivisions constrain scale/distances but
are not wall x/y coordinates. Use one uniform source-to-cm transform for all layers.
The final cm wall network must reproject onto the unchanged source with the same
transform; obvious/systematic drift is an A-layer failure.

## Optional open ground

`floors[].floorAreas` is only for source-visible open ground that is not an enclosed
wall-derived room. Each area has `id`, `name`, optional confidence and an ordered
boundary made from existing wall refs and/or explicit source points. Do not overlap
an existing closed room or use `floorArea` merely because a semantic label suggests
walkable floor.

## Minimal example

```json
{
  "schemaVersion":"plan2world-draft-v1",
  "presentation":"semantic-white-model",
  "furnitureVocabulary":"plan2world-furniture-v1",
  "name":"Source plan",
  "units":"cm",
  "scale":{"mode":"measured","confidence":0.9,"basis":"visible dimension"},
  "assumptions":["Window height/sill omitted: semantic-white-model uses editable floor-to-ceiling glass."],
  "floors":[{
    "id":"f0","name":"Ground floor","level":0,
    "walls":[
      {"id":"w1","start":{"x":0,"y":0},"end":{"x":400,"y":0}},
      {"id":"w2","start":{"x":400,"y":0},"end":{"x":400,"y":300}},
      {"id":"w3","start":{"x":400,"y":300},"end":{"x":0,"y":300}},
      {"id":"w4","start":{"x":0,"y":300},"end":{"x":0,"y":0}}
    ],
    "doors":[{"id":"d1","wallId":"w4","position":0.5,"width":300,"type":"sliding"}],
    "windows":[
      {"id":"n1","wallId":"w1","position":0.5,"width":400},
      {"id":"n2","wallId":"w2","position":0.5,"width":300},
      {"id":"n3","wallId":"w3","position":0.5,"width":400}
    ],
    "furniture":[]
  }]
}
```

This is one empty closed room with three fully glazed sides and one full-side
sliding door. It requires no semantic room label.
