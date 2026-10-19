# Plan2World semantic white-model contract

Version: `plan2world-draft-v1`  
Presentation: `semantic-white-model`  
Furniture vocabulary: `plan2world-furniture-v1`  

All world lengths are centimetres. The draft is the product contract; reconstruction
uses only two geometry-side internal contracts before it:

`source-wall-trace-v1 -> bare-house-v1 -> annotations -> plan2world-draft-v1`

## Geometry ownership

`source-wall-trace-v1` stores original-raster wall evidence. `bare-house-v1` stores
the deterministic normalized wall graph and closed enclosure loops. The Bare House
owns the hard source-fidelity gate.

Normalization may split existing walls at source-supported intersections/T-junctions
and snap small endpoint residuals. It must never create a connector across a real
unsupported gap.

Doors/windows and furniture annotate an accepted Bare
House. They do not create or close geometry. Native rooms are derived from draft
walls; the draft does not author room polygons.

## Root fields

Required:
- `schemaVersion: "plan2world-draft-v1"`
- `presentation: "semantic-white-model"`
- `furnitureVocabulary: "plan2world-furniture-v1"`
- `name`
- `units: "cm"`
- `scale`
- `floors`

`scale.mode` is `measured`, `provided` or `estimated`; confidence is 0..1.

## Walls

Each wall requires `id`, `start`, `end`; optional `curvePoint`, `kind`, positive
`thickness`/`height`, and confidence are supported. Reconstruction normally omits
physical thickness/height unless established.

Draft walls come from the accepted `bare-house-v1`. Shared walls are emitted once.
Connected normalized geometry shares coordinates.

A wall-frame failure is hard only when source structure is materially wrong: a real
wall is missing, unsupported geometry was invented, a source-supported enclosure
cannot close after normalization, or the whole-plan overlay materially disagrees
with the original.

See [opening-trace.md](opening-trace.md) for the two internal geometry stages.

## Doors and windows

Each emitted opening requires:
- unique `id`;
- existing normalized `wallId`;
- `position` from 0..1 along the host;
- positive physical `width`.

Openings have no independent thickness. The logical host remains continuous. A
full-wall window or full-wall sliding door is valid.

Door `type` may be `single`, `double`, `sliding` or `opening` when source evidence
supports it. Omitted window height/sill uses the editable semantic-white-model
default of floor-to-ceiling fixed glass.

Opening uncertainty is review-level. Missing/approximate position, width,
operation or completeness does not invalidate an accepted Bare House unless later
evidence proves the host wall geometry itself is wrong.

## Furniture

Current reconstruction emits:
- stable `id`;
- `catalogId: "imported_object"`;
- exact fixed-vocabulary `sourceCategory`;
- approximate centre `position`;
- optional confidence.

Omit source-unknown size, rotation and styling. Runtime placeholders remain editable.

## Source registration and scale

Source registration uses actual normalized Bare House wall endpoints on the
unchanged original raster. Prefer 3–6 spread-out reliable anchors; 2 is minimum.

Printed dimensions and dimension-chain subdivisions constrain scale/distances but
are not wall coordinates. Use one uniform source-to-cm transform for all layers.
Do not independently move walls to make dimension arithmetic close.

## Optional open ground

`floors[].floorAreas` is only for source-visible open ground that is not an enclosed
wall-derived room. Do not use `floorArea` merely because a semantic label suggests
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
  "floors":[{
    "id":"f0","name":"Ground floor","level":0,
    "walls":[
      {"id":"w1","start":{"x":0,"y":0},"end":{"x":400,"y":0}},
      {"id":"w2","start":{"x":400,"y":0},"end":{"x":400,"y":300}},
      {"id":"w3","start":{"x":400,"y":300},"end":{"x":0,"y":300}},
      {"id":"w4","start":{"x":0,"y":300},"end":{"x":0,"y":0}}
    ],
    "doors":[{"id":"d1","wallId":"w4","position":0.5,"width":300,"type":"sliding"}],
    "windows":[],
    "furniture":[]
  }]
}
```
