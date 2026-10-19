# Opening trace on an accepted Bare House

Geometry is already owned by:

`source-wall-trace-v1 -> bare-house-v1`

Doors/windows annotate `bare-house-v1`; they never create walls or a second enclosure contract. Use normalized Bare House wall IDs and keep the logical host continuous.

## Opening evidence

For each observed opening record:
- `id` and `kind` (`door` or `window`);
- normalized `wallId`;
- two jamb/glazing endpoints in the original raster;
- visible evidence;
- optional evidence-backed door operation.

Example:

```json
{
  "cmPerPixel":1.8,
  "bareHouse":{"schemaVersion":"bare-house-v1","...":"..."},
  "openings":[{
    "id":"d1",
    "kind":"door",
    "wallId":"w7",
    "endpoints":[{"x":200,"y":300},{"x":250,"y":300}],
    "evidence":"visible jamb-to-jamb aperture",
    "doorType":"sliding",
    "typeEvidence":"parallel sliding panels/track"
  }]
}
```

Run:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

The helper derives draft `position` and `width` from source endpoints and normalized wall geometry. Do not substitute host-length percentages, default widths or swing-arc diameter.

## Review boundary

Opening errors are soft warnings: omitted openings, uncertain extent, wrong operation, or temporary loss of room access do not invalidate an accepted Bare House.

Reopen the geometry gate only when opening evidence proves the host wall itself is missing, misplaced or disconnected.

Door operation is evidence-driven:
- `single`: one hinged leaf;
- `double`: two hinged leaves sharing one aperture;
- `sliding`: sliding-panel/track access, including full-side systems;
- `opening`: evidenced leafless passage.

Fixed glazing remains a window. Solid piers remain wall; do not stretch glazing across them. Full-side glazing or sliding access is valid without any balcony semantic.
