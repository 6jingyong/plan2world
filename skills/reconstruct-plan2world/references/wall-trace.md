# Wall evidence pass

This is the first and narrowest LLM task. Read the unchanged source image and emit
only source-pixel wall evidence.

Output `source-wall-trace-v1`:

```json
{
  "schemaVersion":"source-wall-trace-v1",
  "walls":[
    {"id":"w1","start":{"x":120,"y":80},"end":{"x":520,"y":80}}
  ],
  "doorGaps":[
    {
      "id":"gap1",
      "fromWallId":"w1a",
      "toWallId":"w1b",
      "from":{"x":300,"y":80},
      "to":{"x":380,"y":80}
    }
  ]
}
```

The model owns only visual tracing:

- zero-width wall centrelines in original raster pixels;
- optional `curvePoint` for one visible quadratic curve;
- stable raw wall IDs;
- `doorGaps` only when a visible door symbol interrupts one logical wall stroke.

The model must not:

- convert pixels to centimetres;
- use printed dimension-chain numbers as wall coordinates;
- split walls at T-junctions merely for topology;
- snap endpoints or repair closure;
- infer rooms, room polygons or enclosure loops;
- classify furniture/windows/components;
- add thickness, height, rendering or scene fields.

A long raw wall may cross several later rooms. That is intentional: deterministic
normalization owns intersections, splitting and small endpoint snapping.

After this pass, hand the JSON directly to:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

Do not ask the model to review or repair the normalizer's output. A normalizer error
or a material source-overlay mismatch is a geometry-stage failure.