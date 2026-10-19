# Deterministic handoff map

Use the LLM only where the source image requires visual/semantic interpretation.
Everything else belongs to scripts or the downstream application.

| Stage | Owner | Input | Output |
| --- | --- | --- | --- |
| Wall evidence | LLM | unchanged source raster | `source-wall-trace-v1` |
| Wall topology | program | wall trace | `bare-house-v1` |
| Source annotations | LLM | source raster + accepted Bare House IDs | `source-annotation-v1` |
| Scale math | program | real length + source endpoints | cm-per-pixel |
| Opening math | program | Bare House + source opening endpoints | host position + physical width |
| Draft assembly | program | Bare House + annotations | `plan2world-draft-v1` |
| Contract/reference checks | program | draft | validation report |
| Rooms/2D/3D/collision | application | accepted draft | native editable home |
| Walkthrough/editing/assets | application/user | native home | product experience |

## Commands

Normalize raw walls:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json > bare-house.json`

Assemble the final draft from evidence:

`node tooling/assemble-plan2world-draft.mjs --bare-house bare-house.json --annotations annotations.json > draft.json`

Validate final draft/source registration when applicable:

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width W --height H --require-furniture-vocabulary true`

Render a diagnostic overlay only when visual comparison is needed:

`node tooling/render-plan2world-svg.mjs --draft draft.json --output review --source source.jpg --width W --height H`

## Ownership rules

Do not ask an LLM to recompute an artifact already owned by a later deterministic
stage. In particular, do not ask it to:

- repair T-junctions or close wall loops;
- calculate scale, width or opening position;
- convert pixels to centimetres;
- validate IDs/vocabulary/schema;
- derive rooms;
- decide collision/walkability from source semantics;
- duplicate native renderer/editor responsibilities.

When a deterministic stage rejects input, return to the immediately preceding
source-evidence stage only if the input evidence itself is wrong. Do not make the
LLM imitate the rejecting program.