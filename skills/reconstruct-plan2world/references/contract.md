# Plan2World semantic white-model contract

Version: `plan2world-draft-v1`, optional presentation `semantic-white-model`.
All world lengths are centimetres. Rotations are degrees around the item's
centre, clockwise in the source's right/down coordinate system. Width is local
x; depth is local y. The editor uses the same live native geometry in 2D, 3D,
architectural cut and collision.

```json
{
  "schemaVersion": "plan2world-draft-v1",
  "presentation": "semantic-white-model",
  "name": "Source plan",
  "units": "cm",
  "scale": {"mode": "estimated", "confidence": 0.6, "basis": "Explain the actual source scale basis"},
  "assumptions": ["Windows use floor-to-ceiling glass as a presentation default. Furniture height and style are not measured from the plan."],
  "sourceRegistration": {
    "floorId": "f0", "confidence": 0.9,
    "anchors": [
      {"wallId": "w1", "endpoint": "start", "image": {"x": 0.1, "y": 0.2}},
      {"wallId": "w2", "endpoint": "end", "image": {"x": 0.9, "y": 0.8}}
    ]
  },
  "floors": [{
    "id": "f0", "name": "Ground floor", "level": 0,
    "walls": [
      {"id": "w1", "start": {"x": 0, "y": 0}, "end": {"x": 600, "y": 0}, "kind": "exterior", "confidence": 0.9},
      {"id": "w2", "start": {"x": 600, "y": 0}, "end": {"x": 600, "y": 450}, "kind": "exterior", "confidence": 0.9}
    ],
    "doors": [{"id": "d1", "wallId": "w1", "position": 0.3, "width": 90, "confidence": 0.8}],
    "windows": [{"id": "n1", "wallId": "w2", "position": 0.5, "width": 180, "confidence": 0.8}],
    "furniture": [{"id": "b1", "catalogId": "imported_object", "sourceCategory": "sofa", "position": {"x": 250, "y": 250}, "rotation": 0, "width": 200, "depth": 90, "height": 80, "confidence": 0.7}]
  }]
}
```

Treat the example as a field guide, not a complete home or a source template.
Replace its geometry, scale and anchors using the actual source.

- `scale.mode`: `measured`, `provided` or `estimated`; confidence 0..1 is required.
- Wall: `id`, `start`, `end` required; optional `curvePoint`, positive `thickness`
  and `height`, `kind` (`interior`, `exterior`, `unknown`), confidence 0..1.
  Default height 280; exterior thickness 20, other thickness 12.
- Door/window: require `id`, existing `wallId`, `position` 0..1 and positive
  `width`. Position is the centre along the straight wall, or the quadratic
  parameter t on a curved wall; use curve-path distance for physical width.
  Doors default to 210 cm single doors. Optional explicit window `height` and
  nonnegative `sillHeight` override white-model defaults; omitted values give
  sill 0 and height to the wall top. Use explicit heights only when requested.
- Furniture under this presentation: require `id`, `catalogId: imported_object`,
  nonempty `sourceCategory`, centre `position`, positive `width`, `depth`,
  `height`; optional `rotation` and confidence. Save semantics and occupancy,
  while users choose concrete styles later.
- Source registration: existing `floorId`, confidence 0..1, at least two anchors
  with existing `wallId`, `endpoint` (`start`/`end`) and normalized `image` point.
- Preserve evidence in `assumptions`; do not output native editor selection,
  room polygons, rendering meshes or provider-specific metadata in the draft.

Canonical application schema and conversion live in repository
`6jingyong/plan2world`, `schemas/plan2world-draft-v1.schema.json` and
`src/lib/plan2world/draft.ts`. Legacy drafts without this presentation retain
their prior window defaults and optional catalog furniture hints.
