# Bare-house and opening review

Plan2World reconstructs geometry before semantics. The hard visual pipeline has only
two internal geometry contracts:

1. `source-wall-trace-v1` — original-raster wall evidence;
2. `bare-house-v1` — normalized walls + closed enclosure loops.

Doors/windows are annotations on `bare-house-v1`, not a third geometry contract.

## 1. source-wall-trace-v1

Prepare `wall-trace.json` in original source pixels:

```json
{
  "schemaVersion":"source-wall-trace-v1",
  "maxJunctionDistancePx":3,
  "walls":[
    {"id":"top","start":{"x":0,"y":40},"end":{"x":100,"y":40}},
    {"id":"right","start":{"x":100,"y":0},"end":{"x":100,"y":100}},
    {"id":"bottom","start":{"x":100,"y":100},"end":{"x":0,"y":100}},
    {"id":"left","start":{"x":0,"y":100},"end":{"x":0,"y":40}}
  ],
  "enclosures":[{
    "id":"space-1",
    "boundary":[{"wallId":"top"},{"wallId":"right"},{"wallId":"bottom"},{"wallId":"left"}]
  }]
}
```

Run:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

The normalizer may split existing walls at real intersections/T-junctions and snap
small endpoint residuals onto existing hosts. It may never draw a connector across
unsupported source space.

Its output is `bare-house-v1`. Freeze that output and use its normalized wall IDs
for all later annotations.

## 2. Geometry hard gate

Only the bare house owns the hard visual gate. Fail when:

- a real wall is missing;
- an unsupported wall was invented;
- wall position/shape materially disagrees with the source overlay;
- a source-supported enclosure still cannot close after deterministic normalization.

A long raw wall that crosses a room junction is not a failure when the source lines
already intersect; the normalizer should split it.

## 3. Opening review

Opening review consumes `bare-house-v1` directly:

```json
{
  "cmPerPixel":1.8,
  "bareHouse": { "schemaVersion":"bare-house-v1", "...":"..." },
  "openings":[
    {
      "id":"d1",
      "kind":"door",
      "wallId":"w7",
      "endpoints":[{"x":200,"y":300},{"x":250,"y":300}],
      "evidence":"visible jamb-to-jamb aperture",
      "doorType":"sliding",
      "typeEvidence":"parallel sliding panels/track"
    }
  ]
}
```

Run:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

The helper derives draft `position`/`width` from source endpoints and normalized
wall geometry. Individual opening mistakes are returned as `warnings`; they do not
invalidate the accepted bare house.

There is deliberately no complete `wallSurfaces` solid/window/door partition and no
second enclosure gate here. Those duplicated geometry ownership and made opening
uncertainty block reconstruction.

Door operation remains evidence-driven:

- `single`: one hinged leaf;
- `double`: two hinged leaves sharing one aperture;
- `sliding`: sliding-panel/track access, including full-side systems;
- `opening`: evidenced leafless passage.

Fixed glazing remains a window. Missing windows, uncertain widths, wrong operation
or a temporarily unreachable room are review issues that can be corrected in
2D/3D/walkthrough.

Only re-open the geometry gate when later opening evidence demonstrates that the
bare-house host wall itself is wrong or disconnected.
