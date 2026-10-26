# One architectural observation

Observe the original raster once for walls, windows, doors, sliding doors and
scale evidence. Programs own topology, IDs, host matching and arithmetic.

The supplied image is the confirmed observation input. Optional photo direction/
perspective preparation has already happened upstream. Use pixels in THIS image;
do not undo its crop, infer a paper ratio, rectify the apartment outline or return
coordinates in an earlier photograph. Local views only help inspect a specific
uncertainty and share the same full-image coordinates.

Output `source-architecture-v1`:

```json
{
  "schemaVersion":"source-architecture-v1",
  "scaleEvidence":{
    "kind":"measured_dimension","realLengthCm":360,
    "endpoints":[{"x":100,"y":700},{"x":500,"y":700}],
    "evidence":"Visible 3600 mm dimension and its two source ticks."
  },
  "walls":[{
    "label":"north boundary","start":{"x":100,"y":100},"end":{"x":500,"y":100},
    "evidence":"Visible architectural stroke and aligned aperture jambs.",
    "decision":"accept","decisionBasis":"Continuous architectural host path is source-supported."
  }],
  "openings":[{
    "label":"room entrance","kind":"door",
    "endpoints":[{"x":200,"y":100},{"x":250,"y":100}],
    "evidence":"Aperture between two jambs with a visible swing arc.",
    "doorType":"single","typeEvidence":"One hinged leaf and quarter-circle arc.",
    "decision":"accept","decisionBasis":"The jambs and leaf establish this opening.",
    "uncertainty":"Endpoint positions are approximate at source resolution.",
    "sourceView":"source-views/entry.png"
  }],
  "junctions":[{
    "label":"visible diagonal partition junction","position":{"x":100,"y":100},
    "evidence":"Horizontal dark stroke meets the diagonal stroke at this visible corner.",
    "decision":"accept","decisionBasis":"Both strokes visibly meet; this is not an open passage."
  }],
  "doorGaps":[],"assumptions":[]
}
```

`label` is a human-readable description, not a program ID. Do not emit IDs,
confidence numbers, calculated dimensions, wall host IDs, room topology or scene
fields. Evidence and decision bases are short factual summaries of visible cues,
not private internal deliberation.

## Consistent decisions

- `accept`: visible architectural evidence supports the observed feature.
- `uncertain`: preserve the candidate and state the missing/ambiguous visible
  evidence; the program must not turn it into confirmed geometry.
- `reject`: preserve the candidate and identify visible contrary evidence,
  such as a cabinet outline instead of a door.

Separate three questions for every opening: presence, two observed endpoints,
and operation. Missing a swing arc may leave operation unresolved while a clear
jamb-to-jamb aperture remains accepted. Omit `doorType`/`typeEvidence` when their
evidence is unresolved; do not discard a source-supported aperture for that reason.
Use `opening` only for a visibly leafless passage, not as a synonym for uncertainty.

## Aperture geometry before operation

Locate the two jambs or supported ends of the wall interruption FIRST. Those
two points establish the aperture direction. An open door leaf, swing arc or
handle does not establish the host direction. In particular, two leaves swung
along opposite corridor sides can belong to ONE transverse double-door aperture;
do not turn them into two longitudinal side-wall doors. Record one opening per
visible aperture, with `double` only when both leaves are supported by the source.

Retain clearly bounded leafless passages and faint-door apertures. A continuous
logical host baseline must have an opening record wherever the source establishes
an aperture; otherwise assembly will create a solid wall there. Do not infer an
entrance solely because a space contains a toilet, laundry or bed.

Use feature-specific evidence: identify the visible jambs/interruption and, when
relevant, the separate leaf/track cues. Do not repeat a generic statement such as
"visible architectural evidence" for every accepted feature. For ambiguous
double doors, concealed doors and small sanitary compartments, inspect lossless
source crops during this same observation and retain their `sourceView`.

Scale kinds: `measured_dimension`, `scale_bar`, `provided_length` or
`estimated_reference`. State the supported real length in centimetres and its
source-pixel endpoints; never calculate cm-per-pixel or use printed dimension
chains as wall coordinates.

## Source coverage

Follow the complete visible architectural outline, setbacks and partitions.
Use wall strokes, window frames/tracks, door jambs and sliding-door thresholds
together to establish host paths. Preserve observed residuals; programs snap and
split them. Trace each shared stroke once.

For visibly supported T-junctions, diagonal-wall junctions or crowded corners,
optional `junctions` records use `label`, `position` (original raster pixels),
`evidence`, `decision`, `decisionBasis`, and optional `uncertainty`/`sourceView`.
These are visible point observations, not wall IDs, model-authored room topology,
or computed line intersections. Programs associate nearby wall candidates.
The current source-topology review records these associations without extending
or moving geometry; ambiguous or unresolved junctions require review.

For EVERY accepted door, window or sliding door, observe and include its complete
source-supported host baseline in `walls` during this SAME architectural
observation. A host baseline includes the aperture interval: the absence of a
black wall stroke across glass, tracks or a door opening is not a reason to omit
that interval. Use the observed jambs, flanking wall piers and frames/tracks to
establish the path. Do not output an opening while forgetting its observed host
baseline. Full-width glazing still needs that baseline. Trace a shared baseline
once, not a separate overlapping wall for each opening.

Do not invent a baseline where the source does not establish one: retain the
candidate as uncertain and state the missing evidence. The model observes the
baseline, but NEVER chooses its host ID or performs matching. Programs assign
IDs, normalize and associate the observations. This is not an extra visual pass.

Initial vertical policy is program-owned: every accepted door/window starts at
floor level and extends to its host wall height (window sill = 0). This is a user-
chosen editable starting state, not a measurement inferred from the image. Do
not output height, sillHeight, wall height or derived opening widths. Users can
adjust opening height and window sill later in the native walkthrough editor.

For rounded architectural outlines, prefer a modest piecewise-straight trace in
source pixels. Follow visible changes of direction; preserve recesses, opening
jambs and shared junctions. Do not replace a rounded footprint with its bounding
box. Keep jambs on their observed host segments; disclose any polygon segmentation
of continuous glazing rather than claiming visible piers. Polygon approximation
is an intentional walkthrough presentation choice, not a claim of surveyed
accuracy. Record it once in `assumptions`; no duplicate detail inventory is needed.
Optional quadratic `curvePoint` remains available when a curve is clearly
supported and useful. This observation policy never flattens curves already
authored in a native Project. Door swing arcs, furniture outlines, floor seams,
sanitary edges and dimension chains are not walls. Keep plausible rejected
examples in the audit where confusion occurs.

If visible door symbols break a logical host stroke into two source segments,
`doorGaps` may contain only `from`, `to`, and a factual `evidence` string. Programs
associate hosts; never choose host IDs or bridge an unsupported gap.

Thin balcony perimeter strokes do not establish railing height or full-height
glazing. Preserve ambiguous glazing/railing candidates as uncertain; do not assert
that an application default is observed construction.

Before emitting this ONE architectural observation, sweep the full image by
source region: exterior outline and glazing, shared partitions and junctions,
then visible apertures in each region, including small utility/sanitary spaces.
Check each visible aperture against its host observation and each complex
junction against its source evidence. This is a coverage check within the same
observation, not a second/third wall-identification round or permission to guess
missing features. Keep uncertain candidates instead of silently dropping them.

Freeze the whole architectural observation before running a normalizer. Furniture
observation must not reconsider its openings. A changed architectural decision
requires a new run and new evidence, with the previous record retained.

## Functional zones in the SAME observation (current default)

The current workflow requires a `functionalZones` array in this architecture
response. This is a backward-compatible extension of `source-architecture-v1`;
legacy inputs without it are compatibility inputs, not evidence that the new
method ran. Do not add a third observation/model call.

Identify functional zones together with actual walls and openings: bedrooms,
bathrooms, walk-in closets, service rooms, living/dining/study areas, corridors
and balconies as visibly supported. Furniture is contextual evidence for usage;
individual furniture semantics/positions are still collected separately later.
A function label alone cannot prove its perimeter or a physical wall. Retain
uncertain subdivisions. A cupboard is not automatically a walk-in room, and a
shower's thin glass/frame must not silently become a full-height solid wall.

Each zone has the existing `label`, `evidence`, `decision`, `decisionBasis`,
optional `uncertainty` and `sourceView`, plus:

- `category`: short functional meaning, e.g. `bedroom`, `dressing`, `living`,
  `circulation`, `bathroom`, `balcony` (free text, not a furniture category).
- `environment`: `indoor`, `balcony` or `outdoor`.
- `position`: one source-pixel point clearly inside this zone. It is a semantic
  seed, not a corrected furniture point or a computed centroid.
- `boundary`: 3–128 ordered source edge observations. Each item has `point`,
  `kind`, `evidence`, optional `curvePoint`. Its edge goes from this point to
  the NEXT item's point; the last returns to the first. This is an approximate
  source outline, not a replacement wall model. Do not emit wall IDs or derived
  adjacency. Shared physical wall strokes still appear only once in `walls`.

`kind` describes THAT edge:

- `wall`: source-supported physical wall or its door/window host path.
- `window`: source-supported glazing/frame path. Observe the window separately
  in `openings` as usual; glazing is not a traversable passage.
- `passage`: source-supported leafless functional threshold, with both endpoints
  at its visible jambs/partition ends. Split the outline at the threshold ends;
  do not mark the entire wall as passage if it contains a smaller door.
- `railing`: source-supported balcony/terrace barrier. Its initial 110cm height
  is an editable program default, not an image measurement.
- `air`: a LOGICAL boundary along a supported balcony/outdoor floor perimeter
  when the construction is unspecified. This means an invisible collision
  boundary by product policy, not a claim that a physical wall was drawn.
- `unknown`: perimeter construction/location is not established well enough to
  authorize a physical span or passage. Retain the uncertainty.

Balconies are independent functional zones even with NO furniture. Every
accepted zone, including a balcony, needs a closed LOGICAL perimeter. Its edges
may be walls, sliding doors, windows, railings or explicit air boundaries.
Source-evidenced outdoor furniture is not a reason to leave a balcony unclosed.
Never fill an exterior recess or turn a whole open courtyard into a room.

Example zone record (paired with the separately observed walls/openings):

```json
{
  "label":"walk-in closet", "category":"dressing", "environment":"indoor",
  "position":{"x":250,"y":250},
  "boundary":[
    {"point":{"x":200,"y":200},"kind":"wall","evidence":"North partition."},
    {"point":{"x":300,"y":200},"kind":"wall","evidence":"East partition."},
    {"point":{"x":300,"y":300},"kind":"wall","evidence":"South partition."},
    {"point":{"x":200,"y":300},"kind":"wall","evidence":"West wall below the jamb."},
    {"point":{"x":200,"y":270},"kind":"passage","evidence":"Clear leafless opening between the two west-side partition ends."},
    {"point":{"x":200,"y":230},"kind":"wall","evidence":"West wall above the jamb."}
  ],
  "evidence":"Closet fittings within three partitions and an open entrance.",
  "decision":"accept", "decisionBasis":"Function, perimeter and open threshold are visible."
}
```

The program associates each zone seed with the EXISTING native faces, separates
logical enclosure from traversability, and tries bounded physical endpoint
connections supported by observed wall continuations. It may insert uncovered
logical passage/railing/air spans from these explicit edge observations; it does
not use an approximate `wall` edge to invent a missing solid wall. Two adjacent
zones can remain connected through a leafless passage while being separately
closed in the logical wall graph. Source outlines and furniture anchors remain
unchanged. If the source cannot establish a threshold between open-plan uses,
keep that subdivision uncertain instead of drawing an arbitrary divider.
