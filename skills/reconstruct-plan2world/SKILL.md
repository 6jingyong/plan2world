---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image into provider-neutral Plan2World draft JSON with connected walls, wall-attached doors/windows and semantic furniture blocks. Use for floor-plan-to-editable-home requests, architectural tracing, reconstruction review or correction. Preserve evidence and uncertainty; leave furniture, door and window styling to the user.
---

# Reconstruct Plan2World

Read [references/contract.md](references/contract.md) and the fixed
[references/furniture-vocabulary.json](references/furniture-vocabulary.json).
Use the attached image as evidence. Produce `plan2world-draft-v1` with
`presentation: "semantic-white-model"` and
`furnitureVocabulary: "plan2world-furniture-v1"`. Require no particular model
provider, API key, paid service or hosted editor.

## 1. Establish one source coordinate system

Establish the original raster dimensions. Work on this exact raster; map crop
coordinates back to it. Use its top-left origin, x rightward and y downward for
all passes. Record a reliable scale anchor if visible; otherwise retain pixels
until the final uniform conversion to cm. Keep the original raster unchanged.

Use the existing `walls`, `furniture`, `doors` and `windows` arrays as layers.
The outline and inventory below are working traces, not another scene or contract.

## 2. Trace the outer wall outline first

Follow the actual outer wall centrelines around the dwelling before labelling
furniture. Trace zero-width lines in original pixels. Preserve recesses, diagonal
walls, curved walls and bay-window projections; never substitute a bounding box
or convex hull. Distinguish physical walls/glazing hosts from text, dimension
lines, open balcony edges and equipment ledges. Keep a real host wall continuous
across door/window interruptions; attach those openings in stage 5.

Use this outline to establish architectural context. A bay projection, window
ledge, wall pier or planter platform belongs to that context, not to the furniture
inventory. Do not force open exterior edges to become walls. Do not infer walkable
ground merely because the outline encloses it. Keep stable wall IDs for reuse
when completing the interior network in stage 4.

## 3. Identify real objects using the fixed vocabulary

For each candidate, first establish a separate furniture, appliance or sanitary
fixture from a recognizable symbol or readable label. Then choose an exact ID
from `furniture-vocabulary.json`. These are two separate checks: a permitted word
such as `cabinet` does not establish that a cabinet exists. A rectangular ledge,
window bay, wall, column, floor pattern or planting platform fails the object
check. A built-in cabinet with a recognizable cabinet symbol remains eligible.
Visible furniture on a balcony remains eligible even outside the outer wall line.

Record only `id`, `catalogId: "imported_object"`, the permitted `sourceCategory`
and approximate source-pixel centre. Do not invent type names, translate IDs,
or emit `unknown`, `other` or free-form placeholder types. If object presence or
a supported type cannot be established, leave it out of `furniture` and record
its source region/reason in `assumptions`. Keep vocabulary gaps for deliberate
later review; never expand the list within a reconstruction to make it pass.

Scan the whole plan, then scan spatial regions once for omissions and duplicates.
Use overlapping crops when helpful and map them back to the original. Refine an
existing inventory ID instead of adding the same object twice. Check kitchens,
bathrooms, storage, balconies and edges. Make at most one targeted pass for
specific unresolved regions; disclose what remains unresolved.

Mark recognized objects using an inventory/overlay while preserving the original.
Furniture erasure is optional, not a required step. Never erase architectural
evidence or verify wall traces against inpainted pixels. Omit dimensions and
rotation: the program supplies editable placeholder cubes. Size, direction,
precise placement and styles belong to later user editing/walkthrough. Evaluate
object presence, permitted semantic type and broad location, not chair angles.

## 4. Complete all shared walls and check closure

Return to the original and reuse the outer trace. Add the interior wall network,
one zero-width centreline per physical wall. Ignore thickness, height and styling.
Do not trace both faces of a thick wall or duplicate shared walls per room. Keep
cabinet edges, furniture symbols and door swing arcs separate from walls.

Use native quadratic `curvePoint` for visible curves. It is a control point, not
a point on the curve: at t=0.5, B=(start+2*control+end)/4. Split only where a
junction or changed curvature requires it. Reuse coordinates at shared corners
and T-junctions. Split/reuse outer wall IDs consistently where new junctions land.

Follow each source-supported enclosed boundary before adding thickness or doors.
Fix tracing/rounding gaps only when the source supports a connection. A real
wall's visible opening does not break its logical boundary. Preserve open-plan
living/dining areas, passages, balconies and exterior voids. Never add partitions
to turn furniture groups or room labels into closed boxes. Keep obscured
connections uncertain. Closure checks consistency; it does not replace source
alignment review. Output shared `walls`, no authored `rooms` polygons.

## 5. Extract wall-hosted doors and windows

Sweep the completed walls once for openings, including sliding, concealed and
shower access. A double track alone does not establish a fixed window: use panel
marks, access context and adjacent wall evidence. Inaccessibility is a reason to
recheck the source, not permission to invent or widen a door.

Attach every opening to an existing `wallId`, preserving its source centre and
width. Keep its host continuous; the deterministic converter creates the aperture.
Use ordinary doors initially. Omit window height/sill/type so the white-model
profile supplies editable floor-to-ceiling fixed glass; disclose this assumption.

## 6. Convert units, register, freeze and verify

Derive one uniform cm-per-pixel scale from a legible dimension with clear
endpoints or an explicit user length. A printed page ratio alone cannot calibrate
a raster without physical page size/DPI. Otherwise estimate from a visible ordinary
doorway, lower confidence and explain the basis. Keep x rightward and y downward.
Apply one translation and scale to walls, controls, opening widths and object centres.

Assign wall thickness/height only now, from reliable source evidence or omitted
editable defaults. Never export thickness 0 or move centrelines to make thickened
faces meet. The contract defaults supply physical properties; they are not source
measurements. Furniture stays type/position only.

Register 3–6 spread-out visible wall-centreline corners/junctions. Each anchor
references an existing endpoint and its actual normalized raster location:
image=(px/width,py/height). Use the same transform; do not fit anchors separately.

- Check IDs/references, finite cm values, optional positive dimensions and opening
  positions in 0..1. Keep each opening wholly within its wall path. Check the fixed
  vocabulary version and exact category IDs. The enum cannot check visual identity;
  compare each object's presence/type/region with the original as well.
- Emit optional `floorAreas` only for source-visible open ground with a supported
  perimeter. Reference existing shared wall paths, including curves. Do not turn
  railings into walls, duplicate enclosed rooms or cover blank voids. Omit uncertain
  outlines and disclose the gap instead of calling them walkable.
- Freeze the complete emitted JSON before verification. Preserve it even if checks
  fail. Never hand-edit a verification output to make a picture or test pass.
- With a Plan2World checkout, run its existing deterministic checker:
  `NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H --require-furniture-vocabulary true`.
- Use SVG only as an intermediate diagnostic for image-to-JSON reliability:
  `node tooling/render-plan2world-svg.mjs --draft draft.json --output review`.
  Add `--source source.jpg --width W --height H` for an overlay when source anchors
  are accepted. The read-only tool does not infer rooms or repair geometry. Furniture
  position markers do not assert a physical footprint. Do not polish SVG as a goal.
- If a review fails, compare original → frozen JSON first, then frozen JSON → SVG.
  Revise the responsible reusable Skill/extraction script or program. Regenerate a
  separate output from the original for any retest. Hand-corrected candidates do
  not demonstrate Skill improvement. Isolate later 3D/viewing/editing failures in
  their own stages; never compensate there for incorrect extraction.
- Deliver JSON and a short note separating contract validity, source alignment and
  completeness. Report vocabulary gaps, uncertain geometry, omitted objects, scale
  basis and checks actually performed. Parsing alone does not establish accuracy.
- For new verification, use the source and this Skill. Do not read old candidates
  or reference annotations before completing the first pass. Never redistribute
  source images without permission.

Stop at the requested draft/source review. Do not expand into collision, navigation,
model styling or browser-matrix audits unless requested. Preserve unresolved issues
instead of repeating full reconstructions until every warning disappears.
