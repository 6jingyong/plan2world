---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into provider-neutral Plan2World draft JSON with connected walls, wall-attached doors/windows and semantic furniture blocks. Use for floor-plan-to-editable-home requests, architectural tracing, reconstruction review or correction. Preserve evidence and uncertainty; leave furniture, door and window styling to the user.
---

# Reconstruct Plan2World

Read [references/contract.md](references/contract.md) before writing a draft. Use
the attached image as evidence. Produce `plan2world-draft-v1` with
`presentation: "semantic-white-model"`. Require no particular model provider,
API key, paid service or hosted editor.

## Trace evidence before styling

1. Establish the original raster dimensions. Work on this exact raster; map any
   crop coordinates back to it. Distinguish walls/glazing from dimensions, text,
   furniture, cabinetry, door swing arcs and dashed balcony outlines.
2. Trace wall centrelines in source pixels before assigning centimetres. Use
   one continuous wall across each visible door/window interruption, then put
   an opening on that wall. Join connected endpoints/T-junctions at identical
   coordinates. Preserve diagonal walls and voids; do not fill blank areas with
   invented rooms or partitions.
3. Derive one uniform cm-per-pixel scale from a legible dimension with clear
   endpoints, or an explicit user length. A printed page ratio alone cannot
   calibrate a raster without physical page size/DPI. Otherwise estimate from
   a clearly visible ordinary doorway, lower confidence, and explain the basis.
   Keep x rightward and y downward. Apply the same translation and scale to
   every wall, control point, opening width and furniture footprint.
4. Use a quadratic `curvePoint` for a visible curved wall. The control point is
   not a point on the curve: at t=0.5, B=(start+2*control+end)/4. Split a curve
   when curvature or a junction requires it, rather than producing many tiny
   straight facets. Keep railings and dashed balcony limits distinct from walls.
5. Attach each door/window to the wall it interrupts. Preserve position and
   width. Use ordinary doors initially. Omit window height/sill/type so the
   white-model profile supplies floor-to-ceiling fixed glass following wall
   height. Record this presentation assumption; do not claim the source proves
   glazing height or door/furniture style.
6. Trace clearly visible furniture/fixtures as independent rectangular semantic
   blocks: bed, sofa, table, chair, cabinet, counter, toilet, bathtub, sink, etc.
   Use `catalogId: "imported_object"`, a short `sourceCategory`, measured/estimated
   width/depth, estimated height, centre position and rotation. Use `unknown`
   when identity is uncertain. Do not infer a brand/model or add catalog styles.
   Do not turn cabinets, a bed outline or furniture clusters into room walls.
7. Register 3–6 widely spread visible wall-centreline corners/junctions. Each
   anchor must reference an existing wall endpoint and its actual normalized
   raster location. For source (px,py), use image=(px/width,py/height). All
   correspondences must obey the same transform used in step 3. Do not invent
   anchors or fit the geometry independently of its registration.

## Check and deliver

- Check every id/reference, finite cm value, positive dimension and 0..1 opening
  position. Keep each opening wholly within its wall path. Use at least one
  floor with walls. Output no `rooms`; the product derives room topology.
- Check source alignment at spread-out locations, then inspect every wall,
  opening and furniture footprint against the raster. Mark ambiguous or omitted
  features in `assumptions` and reduce their confidence.
- For visible balcony/terrace ground, emit optional `floorAreas` with an ordered
  `boundary` as described in the contract. Shared sides reference existing wall
  paths, including curves; free points/controls trace the open perimeter. These
  create ground without solid walls or a ceiling. Do not duplicate an enclosed
  room or infer a floor from a bounding rectangle. If limits remain uncertain,
  omit the outline and disclose the missing ground; verify before calling it walkable.
- When a Plan2World checkout is available, use its deterministic checker:
  `NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H`.
  Read its findings and fix invalid references, registration or impossible
  openings. Keep a copy of the first pass when recording a verification run.
- Deliver the JSON and a short review note: scale basis, uncertain geometry,
  omitted elements, and checks actually performed. Distinguish structural
  validity from visual correctness; never call a draft accurate merely because
  it parses or because existing tests pass.
- For a new reconstruction verification, use the source image and this skill.
  Do not read saved candidates or source-reference annotations before finishing
  the first pass. Never redistribute a user's source raster without permission.
