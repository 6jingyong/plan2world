# Optional single local source confirmation

Use only when the caller explicitly enables source recovery and supplies a review
callback. Normal reconstruction still uses two observations. A provider transport
error, refusal, missing credential or quota error is not a source-review request.

Read the original overview and the request's focus/context in the SAME source
pixels. The program has already handled exact coincident wall coverage, zero-area
straight wall-outline excursions and the explicit sliding-door kind alias.
It may also bridge an accepted door whose two jambs exactly meet unique opposing
collinear wall ends. These operations neither fit lines nor invent construction.

Choose one:

- `confirm-aperture-host`, when offered: each pinned candidate's two original
  endpoints really are the two jambs of the accepted aperture. The program adds
  only that aperture's logical host; no solid flanking span is inferred. Return
  no replacements/additionalWalls for this choice. If the endpoints/direction
  are wrong, do not select it.
- `revise-local-source`: the source establishes a correction. Return only the
  listed local source records, and necessary additional observed walls when the
  request allows them. Include concise visible evidence. Missing coordinates need
  actual local observation; choosing an answer cannot supply unseen endpoints.
- `unconfirmed`: none of the interpretations is established, the source is
  contradictory, or additional manual annotation is needed. The program keeps the
  failure. Do not select a correction just to obtain a closed or reachable room.

Reply with `source-architecture-review-decision-v1`, the exact `requestId`,
`choice`, `evidence`, and optional `replacements: [{path, value}]` and
`additionalWalls: [...]`. Each replacement is a complete ordinary source record
at an allowed path. Never emit native IDs, dimensions, host IDs, furniture,
scale changes or global architecture. A review cannot remove accepted features,
change their kind or move zone seeds; those cases need a new manual observation.
An ordinary wall host may cross a real door aperture only when the corresponding
opening is also recorded in its actual direction and position.

At most one review is allowed for the entire reconstruction, including failures
before and after furnishing. A second failure stays pending for manual work.
The original failed observation, program projection, request and answer are
separate records. The revised projection must pass the original preflight,
opening-host checks and frozen assembly. No in-place source/stage/JSON edits.
After furnishing, keep the original type/position anchors and regenerate the
stage from the reviewed source; never patch an assembled draft or native scene.

Report first-pass status, algorithmic changes, review count and remaining source
findings separately. This optional recovery does not establish image accuracy.
