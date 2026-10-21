# Wall evidence pass

Legacy two-pass reference. The canonical direct Skill now observes walls and
openings together using `architecture-pass.md`; its wall trace is program-derived.

This is the first and narrowest LLM task. Read the unchanged source image and emit
only source-pixel wall evidence.

Output `source-wall-trace-v1`:

```json
{
  "schemaVersion":"source-wall-trace-v1",
  "walls":[
    {"start":{"x":120,"y":80},"end":{"x":300,"y":80}},
    {"start":{"x":380,"y":80},"end":{"x":520,"y":80}}
  ],
  "doorGaps":[
    {"from":{"x":300,"y":80},"to":{"x":380,"y":80}}
  ]
}
```

The model owns only visual tracing:

- zero-width wall centrelines in original raster pixels;
- optional `curvePoint` for one visible quadratic curve;
- `doorGaps` only when a visible door symbol interrupts one logical wall stroke;
- for each gap, only the two observed source-pixel endpoints.

The model must not emit:

- wall or gap IDs;
- `fromWallId` / `toWallId`;
- junction tolerance or enclosure/topology metadata;
- centimetres, wall kind/thickness/height or confidence;
- printed dimension-chain numbers as wall coordinates;
- T-junction splits, snapped endpoints or closure repairs;
- rooms, furniture, windows, components, rendering or scene fields.

A long raw wall may cross several later rooms. That is intentional. `buildBareHouse`
assigns stable IDs by evidence order, then deterministic normalization owns
intersections, splitting, endpoint snapping and door-gap host association.

Before emitting the evidence, perform a source-only coverage sweep:

1. Follow the complete visible outer architectural boundary, including setbacks,
   narrow projections and balconies. Inspect thin architectural strokes and
   glazed thresholds as carefully as heavy wall ink.
2. Follow interior partition strokes, including the boundaries between indoor
   space and balconies. Visible jamb/sill/track evidence can establish an opening
   host path even when it is drawn much more lightly than masonry. Trace only
   that evidenced path; the annotation pass identifies the aperture later.
3. Check that every emitted stroke follows architectural evidence in the raster.
   Cabinet outlines, sanitary-fixture edges, shower-tray edges, floor-finish seams
   and dimension lines must not become partitions just because they look closed.
4. Trace each visible architectural stroke once, including strokes shared by
   adjoining spaces. Do not emit overlapping copies per room or per balcony.
   Prefer one uninterrupted observed run; the normalizer owns later T-junction
   splitting. Duplicate normalized segments reject the wall stage before annotation.

This is a visual completeness check, not a topology repair pass. Preserve observed
endpoint locations, including small residuals: never snap them, extend a wall to
make a room close, or add an unsupported boundary. Thin balcony perimeter evidence
does not establish its height or prove that it is full-height glazing.

After this pass, hand the JSON directly to:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

Do not ask the model to review or imitate the normalizer. A normalizer bug belongs to
the program; visually wrong source evidence belongs to this pass.
