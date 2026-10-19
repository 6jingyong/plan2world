# Source opening intervals and bare-room envelope gate

Plan2World reconstructs the empty architectural shell before furniture. Room use
labels such as bedroom, balcony or study do not decide geometry. First establish
closed spaces from the source wall network; then classify each boundary run as
solid wall, window or door. Furniture is a later layer.

A door/window is a zero-thickness interval on a continuous logical wall path, not
an independent rectangle or solid. The host remains present across the opening so
room topology survives; the converter cuts the visible aperture later. A complete
room side may be 100% window or 100% door while its logical host wall still spans
the full side.

## Door operation

Establish opening presence before operation:

- `single`: one evidenced hinged leaf/arc.
- `double`: two evidenced hinged leaves/arcs sharing one aperture. Use one door
  from outer jamb to outer jamb, not one door per leaf.
- `sliding`: evidenced sliding access. Treat a multi-panel sliding assembly as one
  sliding aperture when the visible track/panel system forms one access opening;
  it may span most or all of a room side. Do not downgrade it to a window merely
  because it is wide or glazed.
- `opening`: evidenced leafless passage.

When a door exists but operation is unclear, omit `type` and retain the unresolved
evidence. Width alone does not prove double leaves. Two parallel tracks do not
prove a hinged double door.

Record actual two jamb/glazing endpoints in the original raster, `wallId`, source
evidence and type evidence. Do not author independent `position`, `width` or
`thickness` in the source trace. The helper derives draft width/position from the
wall path. Curved hosts use path distance, not chord length or mean Bezier t.

## Bare-room envelope working trace

For local A-layer verification, the same `opening-trace.json` may include two
working-only arrays. They are evidence/checking artifacts, not draft contract
fields and not authored `rooms`:

- `enclosures`: ordered wall loops for every source-supported closed space being
  reconstructed. Each boundary part is `{wallId, reverse?}`.
- `wallSurfaces`: a complete partition of each wall used by an enclosure into
  `solid`, `window` and `door` segments.

Every surface segment uses two original-raster endpoints and visible evidence.
`window` and `door` segments also reference exactly one `openingId`. The complete
set of segments for a wall must cover the wall from start to end with no unexplained
gap or overlap. Do **not** silently treat omitted parts as solid wall.

Example: a fully glazed four-sided room can be represented by three full-wall
windows plus one full-wall sliding door. No balcony/terrace classification is
required to create that room. If the source later supports a semantic component
label, it may be recorded separately, but that label must not create, close or
modify the room geometry.

```json
{
  "cmPerPixel": 2,
  "walls": [
    {"id":"w1","start":{"x":0,"y":0},"end":{"x":100,"y":0}},
    {"id":"w2","start":{"x":100,"y":0},"end":{"x":100,"y":80}},
    {"id":"w3","start":{"x":100,"y":80},"end":{"x":0,"y":80}},
    {"id":"w4","start":{"x":0,"y":80},"end":{"x":0,"y":0}}
  ],
  "openings": [
    {"id":"n1","kind":"window","wallId":"w1","endpoints":[{"x":0,"y":0},{"x":100,"y":0}],"evidence":"Full-height glazing"},
    {"id":"n2","kind":"window","wallId":"w2","endpoints":[{"x":100,"y":0},{"x":100,"y":80}],"evidence":"Full-height glazing"},
    {"id":"n3","kind":"window","wallId":"w3","endpoints":[{"x":100,"y":80},{"x":0,"y":80}],"evidence":"Full-height glazing"},
    {"id":"d1","kind":"door","wallId":"w4","endpoints":[{"x":0,"y":80},{"x":0,"y":0}],"evidence":"Continuous sliding-panel system","doorType":"sliding","typeEvidence":"Parallel sliding track and panels"}
  ],
  "enclosures": [{
    "id":"space-1",
    "boundary":[{"wallId":"w1"},{"wallId":"w2"},{"wallId":"w3"},{"wallId":"w4"}]
  }],
  "wallSurfaces": [
    {"wallId":"w1","segments":[{"kind":"window","openingId":"n1","endpoints":[{"x":0,"y":0},{"x":100,"y":0}],"evidence":"Complete glazed side"}]},
    {"wallId":"w2","segments":[{"kind":"window","openingId":"n2","endpoints":[{"x":100,"y":0},{"x":100,"y":80}],"evidence":"Complete glazed side"}]},
    {"wallId":"w3","segments":[{"kind":"window","openingId":"n3","endpoints":[{"x":100,"y":80},{"x":0,"y":80}],"evidence":"Complete glazed side"}]},
    {"wallId":"w4","segments":[{"kind":"door","openingId":"d1","endpoints":[{"x":0,"y":80},{"x":0,"y":0}],"evidence":"Complete sliding-door side"}]}
  ]
}
```

Run:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

The helper is a **mandatory A-layer freeze gate** for a local reconstruction run.
It checks:

1. each opening has two observed endpoints on one continuous host wall;
2. split hosts fail instead of being stitched or extended automatically;
3. every enclosure wall has a complete `wallSurfaces` partition;
4. every door/window surface interval matches the corresponding opening trace;
5. every listed enclosure wall loop actually closes in source-pixel space.

A nonzero error means A fails. Freeze the failed trace/candidate and stop; do not
repair the JSON by hand and do not continue to contract/native/3D validation.
Fix the reusable recognition/tracing procedure, then rerun from the original raster.

The default endpoint/loop tolerance is 3 source pixels. Do not raise it just to
hide incorrect tracing. Solid piers remain explicit `solid` intervals between
openings. If a wall is entirely glazing or entirely a sliding door, its single
surface segment may legitimately cover the complete wall path.

The helper validates consistency, not visual truth. A model can still misclassify
a source region while producing internally valid intervals. Therefore the frozen
whole-plan source overlay remains the final A-layer visual check. Valid projection,
closed loops and complete surface coverage cannot replace comparing the candidate
against the unchanged original image.
