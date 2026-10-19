---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into a normalized bare house, then annotate openings and optional furniture before emitting plan2world-draft-v1.
---

# Reconstruct Plan2World

Read:
- [references/contract.md](references/contract.md)
- [references/opening-trace.md](references/opening-trace.md)
- [references/furniture-vocabulary.json](references/furniture-vocabulary.json)

Pipeline:

**source raster -> source-wall-trace-v1 -> bare-house-v1 -> annotations -> plan2world-draft-v1**

Geometry owns geometry. Labels, openings and furniture never create or close walls.

## 1. Trace walls in source pixels

Use the unchanged original raster: top-left origin, x right, y down. Map crops back to it.

Emit `source-wall-trace-v1` with raw wall centrelines, optional enclosure boundaries and a small junction tolerance. A raw wall may span multiple rooms; deterministic normalization may split it later.

Do not trace furniture, cabinet edges, dimension lines, swing arcs or semantic labels as walls. Door/window gaps do not break their logical host. Printed dimensions constrain scale/distances only; never use cumulative dimension values as wall coordinates.

## 2. Normalize to Bare House

Run:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

`bare-house-v1` may split walls at real intersections/T-junctions and snap small endpoint residuals onto existing geometry. It may never invent a connector across unsupported source space.

Fail the geometry gate only when a real wall is missing, an unsupported wall is invented, a source-supported enclosure still cannot close, or the whole-plan overlay materially disagrees with the source. Freeze the accepted raw trace and Bare House before continuing.

## 3. Annotate openings

Openings reference normalized Bare House wall IDs and observed source endpoints. Derive position/width with:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

Opening extent, operation or completeness errors are review warnings. Reopen the geometry gate only when opening evidence proves the host wall itself is wrong or disconnected.

Evidence-backed door types are `single`, `double`, `sliding` and `opening`. Fixed glazing remains a window; full-side glazing/sliding access is valid without any balcony semantic.

## 4. Add optional furniture

After the empty house exists, establish a real object first and then choose an exact `sourceCategory` from `furniture-vocabulary.json`.

Emit stable `id`, `catalogId: "imported_object"`, `sourceCategory`, approximate centre and optional confidence. Omit source-unknown size/rotation; runtime placeholders remain editable.

## 5. Convert once and emit

Use one cm-per-pixel transform for Bare House walls, openings, furniture and source registration. Prefer a trustworthy dimension or explicit user length; a bare drawing ratio is insufficient without page size/DPI or a usable scale bar.

Emit `plan2world-draft-v1` with `presentation: "semantic-white-model"`, `furnitureVocabulary: "plan2world-furniture-v1"` and `units: "cm"`. Draft walls come from the accepted Bare House; do not author room polygons. Use 3–6 spread-out source-registration anchors when reliable.

## 6. Validate without regenerating good geometry

Freeze the original raster, raw wall trace, Bare House, opening evidence/warnings and final draft. A soft opening warning does not justify retracing accepted walls.

Useful checks:

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H --require-furniture-vocabulary true`

`node tooling/render-plan2world-svg.mjs --draft draft.json --output review --source source.jpg --width W --height H`
