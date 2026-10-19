# Component recognition evidence

Read `component-vocabulary.json` before the dedicated architectural pass. Keep a
working source inventory before furniture, then resolve geometry references after
walls/openings/floorAreas/floorOpenings are complete. In a local verification deliver this
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
evidence. Geometry references use `wall`, `door`, `window`, `floorArea` or
`floorOpening` IDs on that same draft floor. Do not add furniture references or
copied meshes/outlines. Missing mapping is a reported gap, not permission to add
source-unsupported walls. In the ordinary one-JSON AI response keep the working
inventory internal; include unresolved/unmodeled component types and locations in
draft `assumptions`. The companion file is review evidence, not a second application
interchange format.

Run `python scripts/check-component-review.py --review component-review.json --draft draft.json`
from this Skill directory. It is read-only and reports missing mappings, evidence-only
features and native modeling gaps separately. The report cannot certify visual
recognition. Any unmodeled or unresolved component must be stated in the review;
do not call the result completely modeled/walkable because the checker parses it.

## Vertical and ownership risks

- A component describes a feature; referenced walls/windows/floorAreas/floorOpenings
  own its geometry or slab semantics exactly once. A bay is not another box on top
  of those objects.
- A wall pier integrated with walls is not also a standalone column. Fixed storage
  needs recognizable cabinet evidence; a rectangular ledge alone is architecture.
- A balcony guard remains observed guard evidence. Under `balcony-policy.md`, its
  supported perimeter may host assumed full-height glazing. Reference those walls
  and windows from the balcony; never add duplicate solids or floorAreas. The
  checker tests current enclosure mappings, not historical open-balcony policy or
  actual room closure. Equipment ledges are not automatically living floor.
- A positively recognized enclosed shaft must reference its enclosure walls plus
  exactly one `floorOpening` whose `wallIds` are the same closed wall-derived room.
  The native room remains the ownership boundary but has no slab. Do not use this
  for a tiny closet merely because it is small or lacks a visible door.
- Generic open atria or floor holes that do not exactly match one closed wall-derived
  room remain unsupported; record them as `floor_void` evidence instead of inventing
  enclosing walls just to fit `floorOpenings`.
- Recognize stairs from tread/flight or labelled stair evidence. Distinguish an
  up/down arrow from a compass, door arc, rug, lift and annotation. Optional
  `vertical: {"direction":"up","toFloorId":"f1"}` is only for stairs. Omit
  direction/target when not established; never invent an unseen destination floor,
  rise, storey height or ceiling opening. An unknown target remains unresolved.
- For duplexes, do not concatenate separate floor drawings in a single floor or
  assume their raster origins align. Establish a coordinate/scale relationship
  separately for each supplied floor before claiming a vertical connection.
- Native Stair/Column types exist, but current draft conversion does not import
  them. Wall-backed enclosed shaft openings are supported; arbitrary floor-hole
  subtraction, stair collision and cross-floor walkthrough remain explicit gaps.
