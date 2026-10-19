# Component recognition evidence

Read `component-vocabulary.json` before the dedicated architectural pass. Keep a
working source inventory before furniture, then resolve geometry references after
walls/openings/floorAreas are complete. In a local verification deliver this
companion `component-review.json` with the frozen draft:

```json
{
  "schemaVersion":"plan2world-component-review-v1",
  "vocabularyVersion":"plan2world-components-v1",
  "components":[{
    "id":"c1","type":"bay_window","floorId":"f0",
    "image":{"x":0.4,"y":0.2},
    "evidence":"A projecting outer wall with visible glazing, not a separate storage unit.",
    "geometryRefs":[{"kind":"wall","id":"w1"},{"kind":"window","id":"win1"}]
  }]
}
```

Use exact type IDs, a normalized location on the original raster and visible
evidence. Geometry references use `wall`, `door`, `window` or `floorArea` IDs on
that same draft floor. Do not add furniture references or copied meshes/outlines.
Missing mapping is a reported gap, not permission to add source-unsupported walls.
In the ordinary one-JSON AI response keep the working inventory internal; include
unresolved/unmodeled component types and locations in draft `assumptions`. The
companion file is review evidence, not a second application interchange format.

## Source-fidelity gate

Wall position belongs to the visible source trace. Trace wall centrelines in the
original raster first and keep those pixel positions as the geometry evidence.
Printed dimensions, dimension chains and scale bars may constrain distance/scale;
they do not supply wall x/y coordinates. In particular, never accumulate dimension-
chain subdivisions and substitute those cumulative values for visually traced wall
positions. A dimension may validate the distance between two walls only when its
witness/extension endpoints visibly identify those exact walls; it still does not
move the traced centrelines to make the arithmetic close.

Before an A-layer reconstruction can pass, compare the complete transformed wall
network back against the unchanged source. Use the same uniform source-to-cm
transform in reverse, or the saved registration derived from that transform; do not
fit registration independently to hide geometry drift. In local verification,
freeze the emitted candidate as evidence and generate the source overlay. An
obvious or systematic wall-centreline mismatch is an A-layer failure: stop there,
preserve the failed candidate, fix the reusable reconstruction instructions and
make a fresh candidate from the original source. Do not continue into contract,
native conversion or rendering, and never hand-correct the failed candidate.

## Walkthrough relevance gate

Plan2World targets a user-visible, walkable, editable immersive scene rather than
BIM completeness. A discrepancy is blocking when it changes something the user can
see, reach, collide with or edit: visible wall faces, openings, accessible floor,
room shape, collision boundaries or interactive assets. Completely sealed technical
cavities may omit or simplify hidden internal floor/ceiling construction when a
walkthrough user cannot see or enter them and that simplification does not change
visible enclosure geometry or collision. Preserve their source-supported boundary
walls, but do not create BIM-only schema or native work merely to model an unseen
shaft slab. An explicit atrium, stairwell opening or other visible/reachable floor
void remains user-perceptible and must still be reported as a real modeling gap.

Run `python scripts/check-component-review.py --review component-review.json --draft draft.json`
from this Skill directory. It is read-only and reports missing mappings, evidence-only
features and native modeling gaps separately. The report cannot certify visual
recognition or source-overlay alignment. Any user-perceptible unmodeled or unresolved
component must be stated in the review; hidden BIM-only detail is not a blocking gap.

## Vertical and ownership risks

- A component describes a feature; referenced walls/windows/floorAreas own its
  geometry exactly once. A bay is not another box on top of those objects.
- A wall pier integrated with walls is not also a standalone column. Fixed storage
  needs recognizable cabinet evidence; a rectangular ledge alone is architecture.
- A balcony guard remains observed guard evidence. Under `balcony-policy.md`, its
  supported perimeter may host assumed full-height glazing. Reference those walls
  and windows from the balcony; never add duplicate solids or floorAreas. The
  checker tests current enclosure mappings, not historical open-balcony policy or
  actual room closure. Equipment ledges and shafts are not automatically living
  floor. Visible plants alone do not establish a built-in planter.
- A sealed shaft still needs correct visible enclosure walls, but its unseen
  internal slab/ceiling state is intentionally ignored when it cannot be seen,
  entered, collided with or edited. Do not invent an access opening to expose it.
- Recognize stairs from tread/flight or labelled stair evidence. Distinguish an
  up/down arrow from a compass, door arc, rug, lift and annotation. Optional
  `vertical: {"direction":"up","toFloorId":"f1"}` is only for stairs. Omit
  direction/target when not established; never invent an unseen destination floor,
  rise, storey height or ceiling opening. An unknown target remains unresolved.
- For duplexes, do not concatenate separate floor drawings in a single floor or
  assume their raster origins align. Establish a coordinate/scale relationship
  separately for each supplied floor before claiming a vertical connection.
- Native Stair/Column types exist, but current draft conversion does not import
  them, and explicit visible/reachable floor voids are not subtracted. Capture
  those user-perceptible gaps explicitly. This recognition pass does not implement
  multi-floor modeling, visible floor-hole subtraction, stair collision or
  cross-floor walkthrough.
