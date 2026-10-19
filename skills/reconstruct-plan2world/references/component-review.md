# Component recognition evidence

Read `component-vocabulary.json` before the optional architectural-semantic pass.
The application draft owns component semantics; this review sidecar owns only
source evidence. Components never decide whether a room exists or how its envelope
is built. Closed-room topology belongs to the generic wall/opening reconstruction.

## Draft component contract

Every positively recognized architectural component may be recorded in its draft
floor's `components` array. Emit root
`componentVocabulary: "plan2world-components-v2"` whenever any component is present.

Each component has a stable `id`, exact fixed `type`, approximate plan-space cm
`position`, optional `confidence`, optional same-floor `geometryRefs`, and stair-only
`vertical` evidence. Never emit `render`, `visible`, `sceneEffect`, `sceneSupport`,
`requiresNativeSupport` or equivalent policy flags. Deterministic code reads the
fixed registry and decides scene behavior.

A semantic label is not geometry authority. In particular, `balcony` is optional
source semantics only; a closed glazed room must already exist from the generic
room-envelope pass, and omitting the `balcony` component must not change walls,
windows, doors, floor, collision or room detection.

## Source-review sidecar

For local verification, freeze `component-review.json`:

```json
{
  "schemaVersion":"plan2world-component-review-v2",
  "vocabularyVersion":"plan2world-components-v2",
  "components":[{
    "id":"c1",
    "image":{"x":0.4,"y":0.2},
    "evidence":"Visible source evidence for this semantic classification."
  }]
}
```

The sidecar deliberately does not repeat type, floor, geometry references or scene
policy. Run:

`python skills/reconstruct-plan2world/scripts/check-component-review.py --review component-review.json --draft draft.json`

The checker validates evidence IDs against draft components, same-floor geometry
references, required geometry kinds and deterministic registry policy. It reports
intentional no-ops and unsupported visible scene effects. It does not prove source
classification or source alignment.

## Deterministic scene policy

- `ignore`: retain semantics, create no dedicated 3D object.
- `existing-geometry`: referenced wall/window/etc already owns the visible result.
- `unsupported`: retain the source semantic and report a real scene-support gap.

Examples:

- sealed `shaft` -> boundary-only / existing-geometry;
- `window_ledge`, `equipment_ledge`, optional `balcony` semantic -> evidence-only / ignore;
- `column`, `stair`, `floor_void`, built-in `planter`, standalone `railing` -> unsupported until deterministic native handlers exist.

## Source-fidelity gate

Wall position comes from the visible source-pixel centreline trace. Printed
dimensions, dimension chains and scale bars constrain scale/distances; they do not
supply x/y wall coordinates. Never accumulate dimension-chain subdivisions into
wall positions.

Before A can pass, reproject the complete transformed wall network onto the
unchanged source with the same uniform transform. Do not independently fit
registration to hide drift. An obvious/systematic mismatch is an A-layer failure:
preserve the failed candidate, stop, fix the reusable reconstruction instructions,
and generate a fresh candidate from the original. Do not continue downstream.

## Ownership and vertical risks

- A component describes a feature; referenced geometry owns its shape once.
- Room closure and `solid/window/door` boundary classification happen before
  furniture and independently of semantic room/component names.
- Wall piers are not duplicate columns. Bays are not furniture. Shafts/equipment
  ledges are not living floor.
- Stair arrows establish only visible direction. Never infer unseen target floors,
  rises, holes or alignment between separate floor drawings.
- An unresolved stair target is reported separately from scene support.
