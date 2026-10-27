# Optional spatial-context and evidence-limit experiment

Use for an explicitly requested experiment. The normal two-observation pipeline,
source decisions, geometry programs and browser/provider prompts stay unchanged.
This combines two observation aids; a trial cannot isolate their individual effects.
Do not build a case-specific symbol dictionary, infer a house type's missing
construction or introduce an additional architectural/model pass.

## Overview, spatial context, detail

Keep the overview visible. For a concrete ambiguity, select a focus box and a
larger context box in original pixels. Include the feature's full extent, both
sides of a possible threshold, and the surrounding approach/boundary that makes
the question understandable. Context is a visual selection, not model-authored
room adjacency or proof of access. If that context still clips the relevant
boundary, expand it within this same observation before freezing architecture.
Do not split the image into independently reconstructed tiles or fit each crop.

The general local tool accepts a separate selection request, for example:

```json
{
  "schemaVersion": "plan2world-context-view-request-v1",
  "regions": [{
    "label": "boundary under review",
    "question": "Are the endpoints of this apparent threshold established?",
    "focusBox": [100, 120, 200, 180],
    "contextBox": [40, 60, 300, 260]
  }]
}
```

```sh
node tooling/plan2world-context-views.mjs --source original.jpg \
  --request regions.json --output NEW_DIRECTORY
```

Boxes are `[left, top, right, bottom)`; the tool preserves exact source pixels,
records translation offsets/hashes and refuses overwrites. No image enhancement,
automatic region detection or model request occurs. More/larger views may cost
more image tokens; do not claim savings without measuring the target provider.

## Keep distinct evidence limits

During that architectural observation, use existing `evidence`, `decisionBasis`
and `uncertainty` fields as usual. Optionally retain a concise separate
`source-limit-review.json` with original image identity, feature/property,
reviewed views, visible cues, decision and needed evidence. Do not add unsupported
schema fields to architecture or consume this note as geometry/closure input.

- **Source ambiguity**: at the supplied resolution/context the necessary cues
  remain indistinct or have multiple supported interpretations. This is not proof
  the original designer omitted a door or that no opening exists.
- **Unprovided property**: a property is not established by this view, such as
  construction height or travel behind a wall. Do not discard a supported 2D
  feature because a separate property is unknown. Editable defaults remain defaults.
- **Representation limit**: a visible planar setback/profile or other supported
  feature is omitted or unsupported by the current output. Disclose that gap;
  uncertainty about height does not justify omitting a readable 2D outline.

An **observation omission** is a post-hoc finding that a visible feature was
missed in frozen observations. It is not "information absent from the image".
Record it after freeze; correction requires a new run, never an edited JSON retry.
Neither architectural plausibility, a room label, furniture nor desired
reachability establishes a missing wall, jamb or aperture width.

Freeze architecture and its contemporaneous note before furnishing. Furniture
still observes semantics/positions only. Preflight, furnishing-guided closure,
final freeze and assembly use the existing contracts and order. Evaluate source
evidence and false additions separately from supported-zone counts; replacing
errors with uncertainty or reducing the number of declared zones is not a quality
gain by itself. Preserve previous failures and report unresolved findings.
