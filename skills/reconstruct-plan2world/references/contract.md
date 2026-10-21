# Plan2World final draft contract

Version: `plan2world-draft-v1`  
Optional legacy presentation: `semantic-white-model`  
Furniture vocabulary: `plan2world-furniture-v1`

All world lengths are centimetres. The draft is the product contract. Reconstruction
uses evidence-only intermediate artifacts before it:

`source-architecture-v1 -> source-furnishing-v1 -> architecture-stage-v1 -> plan2world-draft-v1`

The two source artifacts contain observations, not application IDs or derived math.
The architecture stage projects accepted observations into the legacy
`source-wall-trace-v1` and `source-annotation-v1` program contracts. These are not
additional model observation passes.
Optional architectural `junctions` record visible point positions and evidence
without wall IDs. They are associated in a read-only source-topology review;
the current diagnostic does not change normalization or authorize a bridge.
Geometry normalization, IDs, scale policy/math, opening association/math, source
registration and final draft assembly are deterministic.

## Geometry ownership

`source-wall-trace-v1` stores only original-raster wall/gap geometry. `buildBareHouse`
assigns raw wall/gap IDs and normalization produces the program-owned `bare-house-v1`.
Bare House checks topology; it cannot certify fidelity to the original image.
Accepted openings without a resolved host fail normal assembly. An explicit
diagnostic assembly may preserve that failure for inspection, not acceptance.

Normalization may split existing walls at source-supported intersections/T-junctions,
snap small endpoint residuals and associate an explicitly observed door gap with its
two wall runs. It must never create a connector across an unsupported source gap.
Automatic snapping remains conservative (currently 3 source pixels). The separate
`source-topology-review.json` warning radius is the greater of twice that range
and 1% of the shorter original raster dimension (600 px fallback). Warnings do
not use estimated centimetres and do not move geometry.

The CLI inspector writes `indoor-connectivity.json`, a bounded, approximate native
collision grid restricted to indoor native polygons, excluding furniture and
exterior detours. Native door/region associations and unreached/unsampled regions
are review evidence, not automatic doors, certified room semantics or a source
acceptance verdict. Sampling-budget/no-seed outcomes are inconclusive.

The program-projected `source-annotation-v1` stores scale evidence, opening
endpoints/operation evidence and optional furniture semantics/centres. It contains no IDs, numeric confidence,
cm-per-pixel, opening host/width/position, registration anchors or final draft geometry.

The furniture observer cannot change architectural observations. Its anchors are
available before final program closure and guide bounded continuation of already
observed wall endpoints. Candidates, movements and program-derived normalization
input are recorded separately. Final geometry and those anchors are frozen before
draft assembly, which cannot change them. Native rooms remain derived from native
wall geometry; the draft does not author room polygons.

## Root fields

Required:
- `schemaVersion: "plan2world-draft-v1"`
- `furnitureVocabulary: "plan2world-furniture-v1"`
- `name`
- `units: "cm"`
- `scale`
- `floors`

`presentation` is optional. Current semantic furniture blocks are selected by
`catalogId: "imported_object"` with `sourceCategory`, without a project-wide
presentation flag. Do not add a flag to improve a generated result.

The final contract supports `scale.mode` = `measured`, `provided` or `estimated` and
confidence 0..1. Current image reconstruction derives them from evidence kind:

- `measured_dimension` / `scale_bar` -> `measured`, 0.95;
- `provided_length` -> `provided`, 1;
- `estimated_reference` -> `estimated`, 0.5.

## Walls

Each final wall requires `id`, `start`, `end`; optional `curvePoint`, `kind`, positive
`thickness`/`height`, and confidence remain supported for the application contract.
Current image reconstruction assigns wall IDs programmatically and normally leaves
unsupported physical properties to native editable defaults.

Draft walls come from the accepted `bare-house-v1`. Shared walls are emitted once.
Connected normalized geometry shares coordinates.

A wall-frame failure is hard only when source structure is materially wrong: a real
wall is missing, unsupported geometry was invented, or the whole-plan overlay
materially disagrees with the original.

## Doors and windows

Each final opening requires:
- unique program-assigned `id`;
- program-resolved normalized `wallId`;
- derived `position` from 0..1 along the host;
- derived positive physical `width`.

These fields come from source endpoints plus accepted geometry/scale. The annotation
model never authors them.

Openings have no independent thickness. The logical host remains continuous. A
full-wall window or full-wall sliding door is valid.

Door `type` may be `single`, `double`, `sliding` or `opening` when source evidence
supports it. Initial generated doors and windows extend from the floor to their
host wall height, with window sillHeight = 0. The program emits this user-chosen
starting policy; it is not source-visible vertical evidence. Unspecified walls
start at 280 cm. Users can adjust opening height and sill through native editing;
explicit saved height/sill overrides are preserved. Window type stays standard
unless explicitly chosen. This policy does not establish balcony glazing presence.
An omitted door operation is recorded as unresolved; the native application
currently displays its default single type, which must not be reported as an
observed operation.

Opening uncertainty is review-level. Missing/approximate extent or operation does
not invalidate an accepted Bare House unless later evidence proves the host wall
geometry itself is wrong.

## Furniture

Current reconstruction emits:
- program-assigned `id`;
- `catalogId: "imported_object"` assigned by the assembler;
- exact fixed-vocabulary `sourceCategory` observed by the model;
- centre `position` converted from the observed source-pixel centre.

The final draft contract still supports optional confidence/size/rotation fields for
manual or historical inputs, but current image reconstruction does not ask the model
to manufacture them. Runtime placeholders remain editable.

## Scale and source registration

Printed dimensions and dimension-chain subdivisions constrain scale/distances but
are not wall coordinates. The annotation pass supplies an evidence kind, a real
length and its two source-pixel endpoints in the architectural observation; the assembler computes one uniform
cm-per-pixel transform and applies it to every layer.

When source raster width/height are available, the assembler selects spread Bare
House endpoints and emits normalized `sourceRegistration` anchors from the same
original-pixel geometry. The model does not choose anchors. Overlay/review must use
this same transform rather than fitting wall bounds to conceal systematic drift.

## Optional open ground

`floors[].floorAreas` remains import-compatible for explicit source-visible open
ground, but current image reconstruction does not ask the annotation model to invent
or classify these regions. Downstream room derivation remains wall-driven.

## Minimal final-draft example

```json
{
  "schemaVersion":"plan2world-draft-v1",
  "furnitureVocabulary":"plan2world-furniture-v1",
  "name":"Source plan",
  "units":"cm",
  "scale":{"mode":"measured","confidence":0.95,"basis":"visible dimension"},
  "sourceRegistration":{
    "floorId":"floor-0","confidence":1,
    "anchors":[
      {"wallId":"w1","endpoint":"start","image":{"x":0.1,"y":0.2}},
      {"wallId":"w2","endpoint":"end","image":{"x":0.9,"y":0.8}}
    ]
  },
  "floors":[{
    "id":"floor-0","name":"Ground floor","level":0,
    "walls":[
      {"id":"w1","start":{"x":0,"y":0},"end":{"x":400,"y":0}},
      {"id":"w2","start":{"x":400,"y":0},"end":{"x":400,"y":300}},
      {"id":"w3","start":{"x":400,"y":300},"end":{"x":0,"y":300}},
      {"id":"w4","start":{"x":0,"y":300},"end":{"x":0,"y":0}}
    ],
    "doors":[{"id":"d1","wallId":"w4","position":0.5,"width":90,"type":"sliding"}],
    "windows":[],
    "furniture":[]
  }]
}
```

This example documents the final program-owned contract. Image models emit the
architectural and furnishing evidence contracts instead of reproducing this object.

Current architecture observation includes functionalZones in the same model response. Source pixel zone outlines are evidence, not native geometry. Program-inserted passage/railing/air spans remain audited. Draft wall boundaryType is solid/railing/air (optional, legacy solid); air is invisible but colliding, railings use an editable 110cm initial height. Draft floor functionalZones retain seed labels only; native walls own all polygons. Every accepted balcony also requires logical closure.
