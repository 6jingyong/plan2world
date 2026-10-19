# Source annotation pass

Run this only after `bare-house-v1` has been accepted. The model sees the unchanged
source image plus Bare House geometry for context, but it does not produce final
Plan2World geometry or choose normalized host IDs.

Output only `source-annotation-v1` evidence:

```json
{
  "schemaVersion":"source-annotation-v1",
  "scaleEvidence":{
    "mode":"measured",
    "realLengthCm":360,
    "endpoints":[{"x":140,"y":720},{"x":620,"y":720}],
    "confidence":0.95,
    "basis":"Visible 360 cm dimension"
  },
  "openings":[
    {
      "id":"d1",
      "kind":"door",
      "endpoints":[{"x":250,"y":300},{"x":310,"y":300}],
      "evidence":"Visible jamb-to-jamb aperture",
      "doorType":"sliding",
      "typeEvidence":"Parallel sliding panels/track"
    }
  ],
  "furniture":[
    {"id":"f1","sourceCategory":"sofa","position":{"x":420,"y":510}}
  ]
}
```

## What still requires visual/semantic judgement

- which source dimension or user-supplied length is trustworthy;
- the two source-pixel endpoints corresponding to that real length;
- whether an opening exists and its two visible endpoints;
- door operation only when visible evidence supports it;
- whether a separate furniture/appliance/fixture exists;
- exact furniture `sourceCategory` from the fixed vocabulary;
- approximate source-pixel furniture centre.

If no measured/provided scale exists, an ordinary architectural feature may be used
as explicitly `estimated` evidence. State the assumed real length and source endpoints;
the program still performs the division.

## What the model must never calculate or emit

- `cmPerPixel`;
- centimetre wall/furniture coordinates;
- opening `wallId`, `width` or `position`;
- wall splitting, snapping or closure repairs;
- `catalogId`, furniture dimensions or rotation;
- `plan2world-draft-v1`, floors, rooms or scene/render fields;
- source registration anchors derived from already known pixel geometry.

Opening endpoints and furniture positions stay in original source pixels. The
opening program matches both endpoints to one Bare House host and reports a warning
when no single host fits within tolerance.

After this pass, hand the unchanged annotation JSON directly to the deterministic
assembler together with `bare-house-v1` and the original raster dimensions:

`node tooling/assemble-plan2world-draft.mjs --bare-house bare-house.json --annotations annotations.json --source-width W --source-height H`

The assembler rejects unsupported/derived fields rather than trusting them, and it
derives opening hosts, source-registration anchors and final draft fields from the
same accepted source-pixel geometry.
