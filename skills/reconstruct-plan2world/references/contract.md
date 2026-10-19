# Plan2World semantic white-model contract

Version: `plan2world-draft-v1`, presentation `semantic-white-model`, furniture
vocabulary `plan2world-furniture-v1` for current reconstruction. Read the exact
IDs and exclusions in [furniture-vocabulary.json](furniture-vocabulary.json).
All world lengths are centimetres. Rotations are degrees around the item's
centre, clockwise in the source's right/down coordinate system. Width is local
x; depth is local y. The editor uses the same live native geometry in 2D, 3D,
architectural cut and collision.

```json
{
  "schemaVersion": "plan2world-draft-v1",
  "presentation": "semantic-white-model",
  "furnitureVocabulary": "plan2world-furniture-v1",
  "name": "Source plan",
  "units": "cm",
  "scale": {"mode": "estimated", "confidence": 0.6, "basis": "Explain the actual source scale basis"},
  "assumptions": ["Windows use floor-to-ceiling glass as a presentation default. Furniture size and direction use editable display defaults, not source measurements."],
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
      {"id": "w2", "start": {"x": 600, "y": 0}, "end": {"x": 600, "y": 450}, "kind": "exterior", "confidence": 0.9},
      {"id": "w3", "start": {"x": 600, "y": 450}, "end": {"x": 0, "y": 450}, "kind": "exterior", "confidence": 0.9},
      {"id": "w4", "start": {"x": 0, "y": 450}, "end": {"x": 0, "y": 0}, "kind": "exterior", "confidence": 0.9},
      {"id": "w5", "start": {"x": 300, "y": 0}, "end": {"x": 300, "y": 450}, "kind": "interior", "confidence": 0.9}
    ],
    "doors": [
      {"id": "d1", "wallId": "w1", "position": 0.3, "width": 90, "confidence": 0.8},
      {"id": "d2", "wallId": "w5", "position": 0.5, "width": 90, "confidence": 0.8}
    ],
    "windows": [{"id": "n1", "wallId": "w2", "position": 0.5, "width": 180, "confidence": 0.8}],
    "furniture": [{"id": "b1", "catalogId": "imported_object", "sourceCategory": "sofa", "position": {"x": 150, "y": 250}, "confidence": 0.7}]
  }]
}
```

Treat the example as a field guide, not a complete home or a source template.
Replace its geometry, scale and anchors using the actual source. Here `w5` is
one shared wall between two closed spaces; output it once. Doors preserve the
logical wall paths while supplying apertures. Omitted thickness/height use
normalization defaults after the skeleton is checked; zero thickness is invalid.

- `scale.mode`: `measured`, `provided` or `estimated`; confidence 0..1 is required.
- Wall: `id`, `start`, `end` required; optional `curvePoint`, positive `thickness`
  and `height`, `kind` (`interior`, `exterior`, `unknown`), confidence 0..1.
  Extraction omits these physical properties unless established: the geometry is
  a zero-width centreline skeleton, not two wall faces. Normalization supplies
  default height 280; exterior thickness 20, other thickness 12.
- Door/window: require `id`, existing `wallId`, `position` 0..1 and positive
  `width`. Position is the centre along the straight wall, or the quadratic
  parameter t on a curved wall; use curve-path distance for physical width.
  Doors default to 210 cm single doors. Optional explicit window `height` and
  nonnegative `sillHeight` override white-model defaults; omitted values give
  sill 0 and height to the wall top. Use explicit heights only when requested.
  Openings have no independent thickness: they mark intervals in continuous host
  walls. Use explicit `type: single` or `double` when leaf evidence establishes it;
  a double door's width is the full shared aperture. Supported sliding access uses
  `type: sliding`; uncertain operation is omitted and disclosed as an assumption.
  Read [opening-trace.md](opening-trace.md) for source evidence and endpoint maths.
- Furniture under this presentation: require `id`, `catalogId: imported_object`,
  exact permitted `sourceCategory` and approximate centre `position`; confidence is
  optional. Omit dimensions and rotation during image extraction. The existing
  imported-object defaults provide a 50 cm cube at rotation 0 in the program.
  Users adjust size, direction, precise position and styles later. Optional
  positive `width`, `depth`, `height` and finite `rotation` remain supported for
  existing drafts and explicit user input; supplied values take precedence.
  SVG uses a position marker without a physical footprint when width/depth
  are omitted. Evaluate extraction on coverage, semantic type and broad position.
  First confirm a real furniture/appliance/sanitary fixture, then choose its
  exact ID from the fixed vocabulary. Bays, ledges, wall piers and planting
  platforms are architectural features, not furniture. If presence/type is
  unconfirmed or unlisted, omit it and record the region/reason in `assumptions`.
  Do not emit `unknown`, `other`, synonyms or invented types. Add vocabulary
  entries only through deliberate versioned maintenance, never during extraction.
- `furnitureVocabulary` must be `plan2world-furniture-v1` for current Skill/AI
  outputs. Strict verification rejects a missing version and unlisted categories.
  Historical drafts without this field retain free-form source labels for import
  compatibility; do not rewrite those saved drafts to pass new verification.
- Source registration: existing `floorId`, confidence 0..1, at least two anchors
  with existing `wallId`, `endpoint` (`start`/`end`) and normalized `image` point.
- Preserve evidence in `assumptions`; do not output native editor selection,
  inferred room polygons, rendering meshes or provider-specific metadata in the draft.

Canonical application schema and conversion live in repository
`6jingyong/plan2world`, `schemas/plan2world-draft-v1.schema.json` and
`src/lib/plan2world/draft.ts`. Legacy drafts without this presentation retain
their prior window defaults and optional catalog furniture hints.

## Open ground outlines

Current reconstruction treats recognized balconies/terraces as independent enclosed
glazed rooms under [balcony-policy.md](balcony-policy.md): continuous wall paths,
hosted windows, no duplicate floorArea. Declare assumed enclosure in `assumptions`.

Optional `floors[].floorAreas` remains available for source-visible open ground
such as exterior access passages, and for historical/manual open balconies. The
following example describes that existing format, not the reconstruction default.
Each area requires unique `id`, `name`, and `boundary`;
confidence 0..1 is optional. Each boundary has 1–256 ordered parts:

- `{"wallId":"w1"}` traces the whole existing wall from start to end;
  `"reverse":true` traverses it backwards. This follows later wall edits.
- `{"point":{"x":600,"y":-180}}` adds a free source point. Its optional
  `curvePoint` controls the quadratic edge to the next part's first point.
- Consecutive parts connect with straight edges and the final edge closes
  automatically. Do not repeat the first point. Use cm and the same scale as walls.

For the example wall w1 from (0,0) to (600,0), an outdoor strip on its upper side is:

```json
{"id":"balcony","name":"Balcony","confidence":0.8,"boundary":[
  {"wallId":"w1"},
  {"point":{"x":600,"y":-180}},
  {"point":{"x":0,"y":-180}}
]}
```

References must exist on the same floor. Reject zero-area/self-crossing outlines.
Do not copy shared curved wall points, create physical railings, cover a blank
void, or duplicate an enclosed room. Omit uncertain limits and record the gap.
The editor stores these surfaces in the existing native Room with an explicit
boundary and outdoor category; wall-derived room detection stays independent.
