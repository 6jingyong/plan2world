---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into provider-neutral Plan2World draft JSON with connected walls, closed room envelopes, wall-attached doors/windows, versioned architectural components and semantic furniture blocks. Preserve evidence and uncertainty; leave deterministic scene policy to the program.
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

**source raster -> bare closed-room topology -> doors/windows -> A-layer gates -> furniture/fixtures -> uniform cm transform -> frozen draft**

Room-use labels and furniture never create geometry.

## 1. One source coordinate system

Use the unchanged original raster with top-left origin, x rightward, y downward.
Map every crop back to this raster. Trace walls in source pixels first. Keep a
reliable scale anchor if visible; otherwise remain in pixels until the final
uniform cm conversion.

Printed dimensions and dimension-chain subdivisions are scale/distance evidence,
not x/y coordinates. Never accumulate a dimension chain into wall positions.

## 2. Reconstruct the bare architectural shell

Trace the complete outer and interior wall-centreline network before furniture.
Use one zero-width logical wall per physical run. Preserve recesses, diagonals,
T-junctions, curved walls and bay projections. Use native quadratic `curvePoint`
for a smooth visible curve rather than many tiny facets.

A visible door/window interruption does not split its logical host wall. Reuse
shared wall IDs once; do not duplicate a shared partition per room. Do not turn
cabinet edges, furniture outlines, dimension lines or swing arcs into walls.

Identify every source-supported closed space as a closed wall loop regardless of
its label or use. A room can have one, several or all sides almost entirely glazing
or doors while the host walls remain continuous logical boundaries. Do not require
or infer a `balcony` classification to create such a room.

Do not invent partitions merely to close furniture groups or room labels. Keep
real open-plan areas, passages, exterior voids and uncertain boundaries open.

## 3. Extract and classify the complete room boundaries

Before furniture, sweep every wall used by a closed-space envelope from end to end
and classify the visible boundary as `solid`, `window` or `door` intervals using
[references/opening-trace.md](references/opening-trace.md).

Every door/window has two observed source-raster endpoints and an existing
continuous `wallId`. Derive draft position/width with the helper; do not author a
percentage or default width.

Door operation is evidence-driven:
- `single`: one hinged leaf;
- `double`: two hinged leaves sharing one full aperture;
- `sliding`: sliding-panel/track access, including very wide or full-side systems;
- `opening`: supported leafless passage.

A multi-panel sliding system may occupy most or all of one room side. Do not call
it a window merely because it is wide/glazed. Conversely, fixed glazing remains a
window. Preserve solid piers between intervals.

For local verification, prepare `opening-trace.json` with `enclosures` and
`wallSurfaces` as described in the reference. The deterministic helper must pass
before the candidate is frozen. It checks host continuity, room-loop closure,
complete wall-surface coverage and 1:1 opening ownership. Unclassified wall
remainders are failures; they are not silently assumed solid.

## 4. Optional architectural semantics

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

## 5. Furniture and fixtures come after the empty house

Now scan the complete source for real furniture, appliances and sanitary fixtures.
First establish that a real object exists, then choose an exact ID from
`furniture-vocabulary.json`. Do not force architecture into furniture categories.

Record stable IDs, `catalogId: "imported_object"`, exact `sourceCategory`,
approximate centre and optional confidence. Omit dimensions and rotation: the
runtime supplies editable placeholders. Unsupported/uncertain objects stay out of
`furniture` and are disclosed in `assumptions`.

Use a region/label coverage ledger to avoid omissions/duplicates. A room name does
not prove that its usual furniture exists.

## 6. Convert once, register and freeze

Derive one uniform cm-per-pixel transform from a trustworthy visible dimension or
explicit user length. A printed drawing ratio alone is not enough without known
page size/DPI or a usable scale bar. If no reliable length exists, estimate from a
visible ordinary doorway and lower confidence.

Apply the same transform to walls, curve controls, opening widths, furniture
centres and component positions. Do not independently move walls to make dimension
arithmetic close.

Use 3–6 spread-out source-registration anchors when reliable. Each anchor references
an existing wall endpoint and its actual normalized original-raster location. Do
not fit registration separately from reconstruction.

Before A can pass:
1. the complete opening/enclosure helper passes;
2. component review passes when components exist;
3. IDs/references and vocabulary versions are valid;
4. the final cm wall network is reprojected onto the unchanged source using the
   same transform and the whole-plan centreline overlay is visually checked.

Any obvious/systematic source mismatch is an **A-layer failure**. Freeze the failed
candidate and evidence, stop immediately, fix the reusable Skill/instructions, and
regenerate from the original source. Never hand-edit the candidate and never
continue to contract/native/3D validation after an A failure.

## 7. Contract reminders

- `schemaVersion`: `plan2world-draft-v1`.
- `units`: `cm`.
- `presentation`: `semantic-white-model`.
- walls: centreline `start/end`, optional quadratic `curvePoint`, optional kind/confidence;
  omit physical dimensions unless actually established.
- doors/windows: existing `wallId`, `position` 0..1, positive `width`; no independent thickness.
- current white-model windows default to floor-to-ceiling fixed glass when height/sill are omitted; disclose this presentation assumption.
- do not output authored room polygons. Native rooms are derived from wall geometry.
- optional `floorAreas` are only for genuinely visible open ground with supported boundaries, not for closed rooms.
- x rightward, y downward; IDs short and unique; shared junctions share coordinates.
- preserve uncertainty rather than inventing geometry.

With a Plan2World checkout, run:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

`python skills/reconstruct-plan2world/scripts/check-component-review.py --review component-review.json --draft draft.json`

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H --require-furniture-vocabulary true`

`node tooling/render-plan2world-svg.mjs --draft draft.json --output review --source source.jpg --width W --height H`

Freeze the original-pixel traces, source evidence and complete emitted JSON before
verification. For a retest after any Skill change, start fresh from the original
image and do not inspect old candidates first.
