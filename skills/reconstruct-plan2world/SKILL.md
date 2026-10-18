---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into provider-neutral Plan2World draft JSON with connected walls, wall-attached doors/windows and semantic furniture blocks. Use for floor-plan-to-editable-home requests, architectural tracing, reconstruction review or correction. Preserve evidence and uncertainty; leave furniture, door and window styling to the user.
---

# Reconstruct Plan2World

Read [references/contract.md](references/contract.md) before writing a draft. Use
the attached image as evidence. Produce `plan2world-draft-v1` with
`presentation: "semantic-white-model"`. Require no particular model provider,
API key, paid service or hosted editor.

## 1. Establish one source coordinate system

Establish the original raster dimensions. Work on this exact raster; map crop
coordinates back to it. Use its top-left origin, x rightward and y downward for
all extraction passes. Record a reliable scale anchor if visible; otherwise
retain pixel coordinates until the final uniform conversion to cm.

The standard layered plan is the existing draft: separate `furniture`, `walls`,
`doors` and `windows` arrays with stable IDs. Enclosed room outlines are derived
from the shared walls. Do not introduce another interchange format or scene.

## 2. Extract furniture in bounded passes

First scan the whole plan for clearly visible furniture and fixtures. Record
each item's stable ID, semantic type and approximate source-pixel centre. Include
small fixtures and edge areas, not just prominent beds and sofas. Use `unknown`
when the outline is visible but identity is unclear; do not invent hidden items.

Then scan spatial regions once for omissions, using overlapping crops where
helpful. Compare with the existing inventory: refine an existing ID rather than
adding the same object again in overlapping crops. Check kitchens, bathrooms,
storage, balconies and the outer edges. Revisit only specific unresolved regions;
stop after one targeted correction pass and disclose remaining uncertainty.

Use an overlay or inventory to mark identified objects while keeping the original
raster unchanged and available. Erasing furniture is an optional experiment,
not a required step. If used, preserve image dimensions/coordinates and keep the
derived image separate. Never erase wall, door or window evidence with a furniture
mask; verify architectural traces against the original, not filled-in pixels.

Represent each supported item with `id`, `catalogId: "imported_object"`, a short
`sourceCategory` and approximate centre `position`. Omit width/depth/height and
rotation for image extraction. The program supplies editable placeholder cubes;
size, direction, precise placement and concrete styles belong to the user's
later editor/walkthrough stage. Check omissions, duplicates, wrong types and
wrong broad regions; do not fail extraction on chair direction or fine alignment.

## 3. Trace the wall skeleton without thickness

Return to the original raster. Trace one zero-width centreline per real wall in source
pixels. Ignore wall thickness, height, material and furniture styling at this
stage. Do not trace both faces of a thick wall as two walls.

Give each wall a stable ID. Adjacent spaces share the same wall, not independent
room outlines. Preserve diagonal walls, recesses and voids. Use a quadratic
`curvePoint` for a visible curve: the control is not a point on the curve;
at t=0.5, B=(start+2*control+end)/4. Split only when curvature or a junction
requires it, rather than producing many tiny straight facets.

Distinguish walls/glazing from dimensions, text, furniture, cabinetry, door
swing arcs and dashed balcony limits. Note visible door/window interruptions
for later attachment; trace their real host wall continuously across them.
Do not bridge an open circulation area that has no source-supported host wall.

## 4. Check closed spaces and circulation

Review the skeleton before adding thickness or detailed openings. Walk the
boundary of each source-supported enclosed space. Join corners/T-junctions at
identical coordinates and check shared walls once. Fix tracing/rounding gaps
where the source clearly shows a connection. A visible door/window gap in a
real wall must not break its logical boundary; it becomes an opening in stage 3.

Use closure as a consistency check against the source. Preserve open-plan
living/dining areas as one connected space where no wall divides them. Keep
passages, exterior voids and open balconies open. Never add a partition merely
to make a room label, furniture group or guessed rectangle form a closed box.
If a missing connection is obscured and cannot be supported, retain uncertainty
and disclose it rather than silently adding a wall. A plausible closed layout
still needs source alignment review.

The skeleton is a working trace, not a second scene or a new interchange format.
Output shared `walls` in the final contract, not per-room polygons or duplicate
walls. The product derives room topology from that one wall network.

## 5. Extract hosted doors/windows and convert units

Derive one uniform cm-per-pixel scale from a legible dimension with clear
endpoints, or an explicit user length. A printed page ratio alone cannot
calibrate a raster without physical page size/DPI. Otherwise estimate from a
clearly visible ordinary doorway, lower confidence, and explain the basis.
Keep x rightward and y downward. Apply the same translation and scale to every
wall, control point, opening width and furniture centre.

Convert the reviewed skeleton to final wall centrelines in cm. Assign thickness
and height only now, using source evidence when reliable or the contract's
editable defaults. Omit uncertain optional values so normalization can apply
those defaults. Never export thickness 0 to represent the working skeleton,
or move its centrelines to force thickened wall faces to meet.

Attach each door/window to its existing host `wallId`, preserving its source
position and width. Keep the host wall continuous in the data; the deterministic
renderer creates the aperture. Use ordinary doors initially. Omit window
height/sill/type so the white-model profile supplies floor-to-ceiling fixed
glass following wall height. Disclose these presentation assumptions.

Sweep each wall once for missed openings, including sliding, concealed and
shower access. A double-track mark is not automatically a fixed window: use its
panel strokes, access context and adjacent wall evidence. An inaccessible space
is a reason to recheck the source, not permission to invent or widen a door.

Convert the furniture inventory using the same transform. Keep furniture and
cabinet outlines separate from architecture throughout.

## 6. Register, check and deliver

Register 3–6 widely spread visible wall-centreline corners/junctions. Each
anchor references an existing wall endpoint and its actual normalized raster
location. For source (px,py), use image=(px/width,py/height). Use the same
transform as stage 5; do not invent anchors or fit geometry independently.

- Check every id/reference, finite cm value, positive dimension and 0..1 opening
  position. Keep each opening wholly within its wall path. Use at least one
  floor with walls. Output no `rooms`; the product derives room topology.
- Check source alignment at spread-out locations, then inspect every wall,
  opening and furniture type/approximate position against the raster. Mark ambiguous or omitted
  features in `assumptions` and reduce their confidence.
- For source-visible outdoor ground (balconies, terraces or exterior access
  passages), emit optional `floorAreas` with an ordered
  `boundary` as described in the contract. Shared sides reference existing wall
  paths, including curves; free points/controls trace the open perimeter. These
  create ground without solid walls or a ceiling. Do not duplicate an enclosed
  room or infer a floor from a bounding rectangle. If limits remain uncertain,
  omit the outline and disclose the missing ground; verify before calling it walkable.
- When a Plan2World checkout is available, use its deterministic checker:
  `NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H`.
  Read its findings and fix invalid references, registration or impossible
  openings. Keep a copy of the first pass when recording a verification run.
- Review extraction before 3D with the read-only SVG tool:
  `node tooling/render-plan2world-svg.mjs --draft draft.json --output review`.
  Compare `plan.svg` with the original by furniture, walls, doors and windows.
  Add `--source source.jpg --width W --height H` for `overlay.svg` only when
  source anchors are accepted. The tool never fits bounds, infers rooms or
  repairs geometry. It shows furniture position markers when dimensions are
  omitted; marker radius is not a physical footprint.
- If SVG looks wrong, freeze the JSON and compare the relevant entry with the
  source first. If the entry is correct but SVG projects it incorrectly, fix and
  test the SVG program with that fixed input. If the entry is incorrect, revise
  the Skill or its extraction script and regenerate from the original source.
  Manually patching a sample JSON is not evidence of a reusable Skill fix.
  Isolate later 3D, viewing and editing faults in their own stages. Report
  contract validity, source alignment and layer completeness separately.
- Deliver the JSON and a short review note: scale basis, uncertain geometry,
  omitted elements, and checks actually performed. Distinguish structural
  validity from visual correctness; never call a draft accurate merely because
  it parses or because existing tests pass.
- For a new reconstruction verification, use the source image and this skill.
  Do not read saved candidates or source-reference annotations before finishing
  the first pass. Never redistribute a user's source raster without permission.

Stop when the requested draft and source-completeness review are delivered.
Do not expand a reconstruction into exhaustive collision, navigation, model-style
or browser-matrix audits unless the user requests that work. Structural checks
cannot prove visual completeness; report remaining omissions instead of repeating
full reconstructions until every warning disappears.
