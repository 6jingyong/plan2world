---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into provider-neutral Plan2World draft JSON with connected walls, deterministic closed-room topology, wall-attached doors/windows, versioned architectural components and semantic furniture blocks. Preserve evidence and uncertainty; leave deterministic scene policy to the program.
---

# Reconstruct Plan2World

Read:
- [references/contract.md](references/contract.md)
- [references/furniture-vocabulary.json](references/furniture-vocabulary.json)
- [references/component-vocabulary.json](references/component-vocabulary.json)
- [references/component-review.md](references/component-review.md)
- [references/opening-trace.md](references/opening-trace.md)

Use the attached image as evidence. Produce `plan2world-draft-v1` with
`presentation: "semantic-white-model"`,
`furnitureVocabulary: "plan2world-furniture-v1"`, and when components are present,
`componentVocabulary: "plan2world-components-v2"`.

The reconstruction order is architectural first:

**source raster -> raw wall trace -> deterministic wall-graph normalization -> closed-room topology -> door/window review -> furniture/fixtures -> uniform cm transform -> frozen draft**

Room-use labels and furniture never create geometry.

## 1. One source coordinate system

Use the unchanged original raster with top-left origin, x rightward, y downward.
Map every crop back to this raster. Trace walls in source pixels first. Keep a
reliable scale anchor if visible; otherwise remain in pixels until the final
uniform cm conversion.

Printed dimensions and dimension-chain subdivisions are scale/distance evidence,
not x/y coordinates. Never accumulate a dimension chain into wall positions.

## 2. Trace the bare wall skeleton

Trace the complete outer and interior wall-centreline network before furniture or
room-use semantics. Use one zero-width logical wall per observed physical run.
Preserve recesses, diagonals, T-junctions, curves and bay projections. A long wall
may legitimately span several rooms at this raw stage.

A visible door/window interruption does not split its logical host wall. Reuse
shared walls once; do not duplicate a partition per room. Do not turn cabinet
edges, furniture outlines, dimension lines or swing arcs into walls.

Identify source-supported closed spaces using ordered raw wall IDs. Do not require
raw wall endpoints to have already been manually split at every room junction.

## 3. Normalize the wall graph deterministically

Before binding doors/windows, run the deterministic wall-graph normalizer:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

The working `wall-trace.json` contains raw `walls` and optional `enclosures` using
ordered raw wall IDs. The normalizer may:

- detect real straight-wall intersections;
- detect an endpoint landing on another straight or curved wall within the source
  tolerance;
- snap only that small endpoint residual to the existing host;
- split a long wall at those junctions into deterministic derived wall IDs;
- rewrite enclosure boundaries to the normalized wall segments.

This is **topology completion, not geometry invention**. The normalizer must never
bridge an unsupported gap by drawing a new wall segment. If two supposed room
boundaries do not meet/intersect within tolerance, the wall skeleton is a hard
failure and reconstruction stops.

This step owns errors such as a horizontal room edge ending on the interior of a
long vertical wall. That is not a failed image reconstruction if the source lines
already intersect: the algorithm should split the vertical wall at that junction.

After normalization, use the normalized walls as the actual draft wall skeleton
and as hosts for all subsequent openings. Do not hand-edit derived junctions.

## 4. Distinguish hard wall failures from soft opening review

The **hard A-layer wall-frame gate** is limited to the bare geometry:

- wall position/shape visibly disagrees with the source;
- a real wall is missing or an unsupported wall was invented;
- a supposed closed space still cannot close after deterministic graph normalization;
- a shared/T-junction cannot be formed from existing traced geometry within tolerance.

Any of those means stop immediately and fix the reusable wall-extraction procedure.

Door/window binding is a separate review layer. Sweep normalized hosts and record
source-supported `solid`, `window` and `door` intervals using
[references/opening-trace.md](references/opening-trace.md), but **do not reject an
otherwise correct wall skeleton solely because a window/door position, width,
operation or completeness is uncertain**. Record those as review warnings for
later 2D/3D/walkthrough adjustment.

Only promote an opening issue back to a hard wall failure when it proves the host
wall geometry itself is wrong (for example, one logical host was incorrectly
traced as disconnected geometry).

Door operation remains evidence-driven:
- `single`: one hinged leaf;
- `double`: two hinged leaves sharing one full aperture;
- `sliding`: sliding-panel/track access, including very wide or full-side systems;
- `opening`: supported leafless passage.

A multi-panel sliding system may occupy most or all of one room side. Fixed glazing
remains a window. A room can have several sides that are entirely windows and
another side that is almost entirely a sliding door; no `balcony` classification
is required.

## 5. Optional architectural semantics

Only after the bare geometry is established, make a semantic component pass using
exact types from `component-vocabulary.json`. Components describe what the source
contains; they do not create geometry or choose render behavior.

Never emit model-authored `render`, `visible`, `sceneEffect`, `sceneSupport` or
`requiresNativeSupport`. The fixed registry owns those decisions.

`balcony` is optional evidence-only semantics. A room must look exactly the same
with or without that label. A sealed `shaft` may reference enclosure walls without
requiring a hidden slab hole. Unsupported visible types such as `column`, `stair`
or `floor_void` remain explicit gaps.

Freeze `component-review.json` only as source evidence for component IDs. It cannot
change application semantics.

## 6. Furniture and fixtures come after the empty house

Now scan the complete source for real furniture, appliances and sanitary fixtures.
First establish that a real object exists, then choose an exact ID from
`furniture-vocabulary.json`. Do not force architecture into furniture categories.

Record stable IDs, `catalogId: "imported_object"`, exact `sourceCategory`,
approximate centre and optional confidence. Omit dimensions and rotation: the
runtime supplies editable placeholders. Unsupported/uncertain objects stay out of
`furniture` and are disclosed in `assumptions`.

Use a region/label coverage ledger to avoid omissions/duplicates. A room name does
not prove that its usual furniture exists.

## 7. Convert once, register and freeze

Derive one uniform cm-per-pixel transform from a trustworthy visible dimension or
explicit user length. A printed drawing ratio alone is not enough without known
page size/DPI or a usable scale bar. If no reliable length exists, estimate from a
visible ordinary doorway and lower confidence.

Apply the same transform to normalized walls, curve controls, opening widths,
furniture centres and component positions. Do not independently move walls to make
dimension arithmetic close.

Use 3–6 spread-out source-registration anchors when reliable. Each anchor references
an existing normalized wall endpoint and its actual normalized original-raster
location. Do not fit registration separately from reconstruction.

Before the wall frame can pass:
1. wall-graph normalization succeeds without inventing a bridge;
2. normalized room envelopes close;
3. the normalized wall network is reprojected onto the unchanged source using the
   same transform and the whole-plan centreline overlay is visually checked.

Door/window helper findings are reported separately as opening-review warnings.
They do not invalidate the wall frame unless they reveal wrong wall geometry.

Any obvious/systematic wall-source mismatch is a hard **A-wall failure**. Freeze
the failed trace/evidence, stop immediately, fix the reusable Skill/instructions,
and regenerate from the original source. Never hand-edit the candidate.

## 8. Contract reminders

- `schemaVersion`: `plan2world-draft-v1`.
- `units`: `cm`.
- `presentation`: `semantic-white-model`.
- walls: normalized centreline `start/end`, optional quadratic `curvePoint`, optional kind/confidence;
  omit physical dimensions unless actually established.
- doors/windows: existing normalized `wallId`, `position` 0..1, positive `width`; no independent thickness.
- current white-model windows default to floor-to-ceiling fixed glass when height/sill are omitted; disclose this presentation assumption.
- do not output authored room polygons. Native rooms are derived from normalized wall geometry.
- optional `floorAreas` are only for genuinely visible open ground with supported boundaries, not for closed rooms.
- x rightward, y downward; IDs short and unique; normalized shared junctions share coordinates.
- preserve uncertainty rather than inventing geometry.

Local tools:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

`python skills/reconstruct-plan2world/scripts/check-component-review.py --review component-review.json --draft draft.json`

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H --require-furniture-vocabulary true`

`node tooling/render-plan2world-svg.mjs --draft draft.json --output review --source source.jpg --width W --height H`

Freeze the raw wall trace, normalized wall graph, opening review, source evidence
and complete emitted JSON. For a retest after any Skill change, start fresh from
the original image and do not inspect old candidates first.
