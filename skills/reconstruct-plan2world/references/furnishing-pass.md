# Furniture-only observation

Read the original raster with frozen architecture as context. Emit only:

```json
{
  "schemaVersion":"source-furnishing-v1",
  "furniture":[{"sourceCategory":"sofa","position":{"x":420,"y":510}}],
  "assumptions":[]
}
```

Use exact categories from `furniture-vocabulary.json` and original source-pixel
centres. Establish a separate object visually before choosing its category. Do
not infer an object from a room label alone. Unsupported objects go in assumptions.

Do not emit walls, openings, scale, IDs, confidence, catalogue IDs, dimensions,
rotation, host matching or final draft fields. In particular, do not remove a door
because its operation or room context now seems uncertain. The parser rejects
architectural fields, and assembly verifies that frozen walls/doors/windows
remain unchanged.

Newly noticed architectural concerns belong in a separate review note. They do
not authorize changing observations, normalized output, draft or 3D geometry.

Only semantics and source position are extraction requirements. Furniture size,
orientation and a realistic model are not extraction quality requirements.
Initial walkthrough representation may be a selectable luminous marker with no
walking collision. That marker, selection and collision policy belong to the
application, not this evidence JSON. The current legacy block preview is not
proof of an observed footprint. Model replacement and category-specific floor/
wall snapping are later program responsibilities; keep source positions as
anchors and do not request guessed size/rotation to compensate for blocked paths.
