# Experimental shared source points

Use only for an explicitly requested representation experiment. The default
architecture prompt, two-observation pipeline and `source-architecture-v1` remain
unchanged. This format does not establish better image recognition.

Observe the original raster afresh. Emit `source-architecture-pointrefs-v1` with
the same architecture fields and decisions as the normal architecture pass, plus:

```json
"sourcePoints": [["northwest visible corner", 100, 100], ["northeast visible corner", 500, 100]]
```

Each tuple is `[source name, x, y]` in the unchanged original image. These names
are local aliases for observed pixel positions, never native wall/room IDs,
opening hosts or calculated junction associations. Reuse a name only when the
source visibly establishes the same point. Do not merge nearby distinct jambs,
corners, framing edges or gaps merely to reduce the table.

Any coordinate-valued field may instead contain that source name, for example
`"start": "northwest visible corner"`. This also applies to opening/scale
endpoints, optional curve controls, junction positions, door-gap endpoints and
functional-zone seeds/boundary points. Single-use positions may remain ordinary
`{"x":123,"y":456}` objects. Feature evidence, operation evidence and
accept/uncertain/reject decisions are still required; aliases do not replace them.

Record each physical stroke once. A duplicate wall remains a source error; this
adapter does not deduplicate, snap, extend or infer geometry. Curves, unknown
boundaries and unresolved operation retain the same meaning as in the default
contract. Do not calculate intersections or reuse old generated candidates.

Freeze the raw observation, then run:

```sh
NODE_ENV=production node tooling/expand-plan2world-pointrefs.mjs \
  --input source-pointrefs.json --source original.jpg --output NEW_EXPANSION_DIRECTORY
```

The program substitutes exact coordinates and invokes the existing observation
parser, writing frozen legacy architecture, usage audit and input/source/code
identities. All declared points, including unused ones, must lie inside the raster.
The ordinary preflight must still run on the expanded output before furnishing.
Observe furniture only after architecture freeze, then use unchanged preparation,
closure and assembly. Keep the raw reference observation and audit with the run.

For comparisons, declare the variable and common inputs before observing. Do not
call a mechanical conversion of an old candidate a new image observation. A
same-observation inline/reference comparison tests semantic equivalence only.
Separate parser success, coordinate redundancy, bytes/tokens, source alignment,
functional separation and opening correctness. Sequential direct-Codex trials
are not blind, and a one-image pilot cannot establish model/provider accuracy.
