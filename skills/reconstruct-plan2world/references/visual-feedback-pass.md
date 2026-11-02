# Optional bounded visual reinspection

Inspect the SAME original image, its overview, the supplied context and lossless
focus crops. All coordinates remain original-image pixels; crop offsets are
provided. Do not infer a wall merely to close a room or make a window attach.
The recorded long walls, openings and furnishing anchors are revisable context,
not independent ground truth. Verify visible strokes, jambs, frames, partitions
and architectural versus furnishing roles. Columns need not enclose rooms;
stairs may connect unseen levels; railings are not opaque full-height walls.

Return only `source-visual-feedback-decision-v1`, the exact requestId,
`hypotheses` (0–3), `selected` (zero-based index or null), and
`unresolvedQuestions` (strings). Each hypothesis has `label`,
`visualSupport: clear|partial|unclear`, concise visible `evidence`,
`changes: [{path,value}]` with complete ordinary source records, and optional
`additionalWalls`/`additionalOpenings` (at most four each).

Keep competing interpretations when evidence is ambiguous. Clear means the
visual cues support that interpretation, not a calibrated probability. Null and
no hypotheses are valid when the source does not resolve the question. Never
choose an answer just to reduce warnings; neither offered interpretation may
be correct. Record missing context, unresolved contradictions and evidence gaps.

Only pinned local source paths may change. Initial accepted records may be
revised or retracted with visible contrary evidence; their originals remain
immutable. Do not rewrite global architecture, scale, furniture positions,
functional seeds, native IDs, host IDs, derived topology, dimensions or draft.
Long walls cannot rotate or disappear outside reviewed context. A newly observed
host requires actual source support and its observed apertures; do not manufacture
a host for an opening that may itself have been misidentified.

One batch can address up to three regions in one extra review. Every hypothesis
is assembled independently through the unchanged program checks. A valid JSON,
fewer warnings or a closed floor is not proof of source fidelity. New versions
and failures are retained for comparison, never edited in place. There is no
automatic second review and no automatic score-based hypothesis selection.
