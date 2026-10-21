# Source annotation pass

Legacy two-pass reference. The canonical direct Skill uses `architecture-pass.md`
then `furnishing-pass.md`; furniture observation has no authority over openings.

Run this only after `bare-house-v1` has been accepted. The model sees the unchanged
source image plus Bare House geometry for context, but it does not own IDs, hosts,
confidence policy, scale math or final Plan2World geometry.

Output only `source-annotation-v1` evidence:

```json
{
  "schemaVersion":"source-annotation-v1",
  "scaleEvidence":{
    "kind":"measured_dimension",
    "realLengthCm":360,
    "endpoints":[{"x":140,"y":720},{"x":620,"y":720}],
    "evidence":"Visible 360 cm dimension"
  },
  "openings":[
    {
      "kind":"door",
      "endpoints":[{"x":250,"y":300},{"x":310,"y":300}],
      "evidence":"Visible jamb-to-jamb aperture",
      "doorType":"sliding",
      "typeEvidence":"Parallel sliding panels/track"
    }
  ],
  "furniture":[
    {"sourceCategory":"sofa","position":{"x":420,"y":510}}
  ]
}
```

## What still requires visual/semantic judgement

- scale evidence kind: `measured_dimension`, `scale_bar`, `provided_length` or
  `estimated_reference`;
- the real length supported by that evidence and its two source-pixel endpoints;
- whether an opening exists and its two visible endpoints;
- door operation only when visible evidence supports it;
- whether a separate furniture/appliance/fixture exists;
- exact furniture `sourceCategory` from the fixed vocabulary;
- approximate source-pixel furniture centre;
- short assumptions only when useful source uncertainty cannot be represented above.

The program maps evidence kind to final scale policy:

- `measured_dimension` / `scale_bar` → measured, confidence 0.95;
- `provided_length` → provided, confidence 1;
- `estimated_reference` → estimated, confidence 0.5.

The model must not invent a numeric confidence for itself.

## What the model must never emit

- any object ID;
- any confidence field;
- final scale `mode`, confidence or `cmPerPixel`;
- centimetre wall/furniture coordinates;
- opening `wallId`, `width` or `position`;
- wall splitting, snapping or closure repairs;
- `catalogId`, furniture dimensions or rotation;
- source-registration anchors;
- `plan2world-draft-v1`, floors, rooms or scene/render fields.

Opening endpoints and furniture positions stay in original source pixels. Programs
assign IDs, match each opening to one Bare House host, derive interval geometry,
convert coordinates and construct the final draft.

For openings, read the two aperture ends on the original raster. Do not substitute
an adjacent sill, cabinet edge or parallel balcony perimeter merely because it
would match the Bare House more easily. Recheck narrow projections and thin
glazed thresholds against their visible jambs.

If an observed aperture has no corresponding architectural host path in the Bare
House, retain its source evidence and disclose the missing wall evidence in
`assumptions`. Do not move the aperture, invent a host ID, or modify the Bare House.
The run is not source-accepted merely because assembly succeeds: investigate any
rejected opening. A wall-pass omission requires a fresh run from the original
raster; a host-association bug requires a program fix.

Hand the unchanged annotation JSON to:

`node tooling/assemble-plan2world-draft.mjs --bare-house bare-house.json --annotations annotations.json --source-width W --source-height H`
