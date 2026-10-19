# Wall evidence pass

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

After this pass, hand the JSON directly to:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

Do not ask the model to review or imitate the normalizer. A normalizer bug belongs to
the program; visually wrong source evidence belongs to this pass.
