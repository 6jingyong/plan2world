---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into a bare architectural shell first, then annotate openings, optional semantics and lightweight furniture before emitting plan2world-draft-v1.
---

# Reconstruct Plan2World

Read:
- [references/contract.md](references/contract.md)
- [references/opening-trace.md](references/opening-trace.md)
- [references/furniture-vocabulary.json](references/furniture-vocabulary.json)
- [references/component-vocabulary.json](references/component-vocabulary.json)
- [references/component-review.md](references/component-review.md)

The pipeline is:

**source raster -> source-wall-trace-v1 -> bare-house-v1 -> opening/component/furniture annotations -> plan2world-draft-v1**

Geometry comes first. Room-use labels, doors/windows, furniture and components never
create or close walls.

## 1. Trace source walls only

Use the unchanged original raster: top-left origin, x right, y down. Map every crop
back to this coordinate system.

Create `source-wall-trace-v1` with:
- raw wall centrelines in source pixels;
- optional ordered enclosure boundaries using raw wall IDs;
- an optional junction tolerance, normally 3 px.

A raw wall may span several rooms. Do not manually pre-split every T-junction.
Door/window gaps do not break their logical host. Do not turn furniture, cabinet
edges, dimension lines, swing arcs or semantic labels into walls.

Printed dimensions and dimension-chain subdivisions are scale/distance evidence,
not wall x/y coordinates.

## 2. Build the Bare House deterministically

Run:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

The result is `bare-house-v1`: normalized walls, closed enclosure loops and the
source-to-normalized wall mapping.

The normalizer may:
- detect real intersections and endpoint-on-wall T-junctions;
- split long walls at those junctions;
- snap only small endpoint residuals onto existing geometry.

It may never invent a connector across unsupported source space.

### Geometry hard gate

The Bare House fails only when:
- a real wall is missing;
- an unsupported wall is invented;
- a supposed source-supported enclosure still cannot close after normalization;
- the normalized whole-plan wall overlay materially disagrees with the original.

A T-junction that the algorithm can split from already traced geometry is not an AI
failure. Small later-editable wall offsets are not automatically a failure either;
structure is the priority.

Freeze the raw trace and accepted `bare-house-v1` before continuing.

## 3. Annotate doors and windows

Openings consume the accepted Bare House; they do not own geometry.

Record each observed opening with:
- normalized bare-house `wallId`;
- two original-raster endpoints;
- visible evidence;
- optional evidence-backed door operation.

Run:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

The helper derives draft position/width. Individual opening mistakes are review
warnings, not Bare House failures. Examples:
- window extent slightly wrong;
- sliding-door width uncertain;
- single/double/sliding operation uncertain;
- an opening temporarily omitted;
- a room temporarily unreachable because a door was missed.

Only reopen the geometry gate when opening evidence proves the host wall itself is
wrong or disconnected.

Door types when evidenced:
- `single` — one hinged leaf;
- `double` — two hinged leaves sharing one aperture;
- `sliding` — sliding-panel/track access, including full-side systems;
- `opening` — leafless passage.

Fixed glazing remains a window. A room may have entire sides of glazing or a
full-side sliding door without any `balcony` label.

## 4. Add optional semantics and furniture

After the empty house exists:

### Components
Use exact types from `component-vocabulary.json`. Components are source semantics,
not geometry authority or render policy. Never emit model-authored `render`,
`visible`, `sceneEffect`, `sceneSupport` or `requiresNativeSupport`.

`balcony` is evidence-only. Adding/removing that label must not change walls,
openings, floor, collision or room detection.

### Furniture
Identify a real object first, then choose an exact ID from
`furniture-vocabulary.json`. Emit stable IDs, `catalogId: "imported_object"`, exact
`sourceCategory`, approximate centre and optional confidence. Omit source-unknown
size and rotation; runtime placeholders remain editable.

## 5. Convert once and emit the draft

Derive one uniform cm-per-pixel transform from a trustworthy dimension or explicit
user length. A bare drawing ratio is NOT enough without physical page size/DPI or a
usable scale bar. If no reliable length exists, estimate conservatively and lower
confidence.

Apply the same transform to Bare House walls, opening widths, furniture centres and
component positions. Never move walls independently to make dimension arithmetic
close.

Use 3–6 spread-out source-registration anchors when reliable. Anchors reference
actual normalized Bare House wall endpoints on the unchanged original raster.

Emit:
- `schemaVersion: "plan2world-draft-v1"`
- `presentation: "semantic-white-model"`
- `furnitureVocabulary: "plan2world-furniture-v1"`
- `componentVocabulary: "plan2world-components-v2"` when components exist
- `units: "cm"`

Draft walls come from `bare-house-v1`. Do not author room polygons; native rooms are
derived from wall topology. Doors/windows reference existing normalized walls.
Current white-model windows default to editable floor-to-ceiling fixed glass when
height/sill are omitted.

## 6. Freeze and validate

Freeze:
1. original source raster;
2. `source-wall-trace-v1`;
3. `bare-house-v1`;
4. opening warnings/evidence;
5. emitted `plan2world-draft-v1`.

Then continue through contract -> native -> 2D/cut/3D -> walkthrough -> editing/assets.
Do not regenerate geometry merely to fix a soft opening warning.

Local tools:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

`python skills/reconstruct-plan2world/scripts/check-component-review.py --review component-review.json --draft draft.json`

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H --require-furniture-vocabulary true`

`node tooling/render-plan2world-svg.mjs --draft draft.json --output review --source source.jpg --width W --height H`
