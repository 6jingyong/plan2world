# Explicit source-object / ground support review extension

This section EXTENDS the architecture-only guide above only when the request is
`source-visual-feedback-v2`. The first architecture and furnishing observations
remain immutable. This opt-in interpretation may revise or retract ONLY listed,
compiler-conflicted furnishing observations. Other furniture and global scale
remain frozen. The same one-batch, three-region, three-hypothesis budget applies.

The compiler reports a point without a supporting floor. That establishes a
conflict, not which observation is wrong. Inspect the overview, context and
original pixels to distinguish: an actual object at another visible position;
a false object identification (text, stair, shaft, symbol or architectural line);
an actual object with missing architectural ground/boundary evidence; or unknown.
Do not move an object to the nearest floor, invent a slab, or retract a visible
object just because it causes a rejection. A label alone is not furniture evidence.

Keep the existing `source-visual-feedback-decision-v1` answer envelope with the
exact new requestId. An optional hypothesis field `furnitureChanges` contains up
to eight `{path, action, evidence, value?}` records. `path` is the exact pinned
`furniture[index]`. `action: revise` needs a complete ordinary source furniture
record in `value` (`sourceCategory`, original-pixel `position`) and correcting
visual evidence. `action: retract` has no value and needs contrary visible
evidence for the original object's interpretation. Unresolved identity, position
or ground remains partial/unclear and selected=null; do not force a choice.

Architectural changes still use the original bounded source rules. Unsupported
ground cannot be added through a furniture record. All candidates rerun the same
closure and compiler-owned point-support inspection. Newly unsupported anchors
or incomplete support checks prevent automatic application. Program acceptance
still does not establish source fidelity. Preserve originals, retracted records,
projection index maps, alternative interpretations and the original negative.
