# Component recognition evidence

Read `component-vocabulary.json` before the dedicated architectural pass. The
application draft owns architectural semantics; the review sidecar owns only
source evidence.

## Draft component contract

Every positively recognized architectural component belongs in its draft floor's
`components` array. Emit root `componentVocabulary: "plan2world-components-v2"`
whenever any component is present.

```json
{
  "componentVocabulary":"plan2world-components-v2",
  "floors":[{
    "id":"f0",
    "components":[{
      "id":"c1",
      "type":"bay_window",
      "position":{"x":420,"y":180},
      "confidence":0.9,
      "geometryRefs":[{"kind":"wall","id":"w1"},{"kind":"window","id":"win1"}]
    }]
  }]
}
```

`type` must be an exact registry ID. `position` is an approximate plan-space cm
centre after the same uniform source transform used by the rest of the draft.
`geometryRefs` may point only to existing same-floor `wall`, `door`, `window` or
`floorArea` IDs. They identify geometry that already owns the visible shape; they
do not create a second mesh. Optional stair `vertical` may contain visible
`direction` and an established `toFloorId` only.

Never emit `render`, `visible`, `sceneEffect`, `sceneSupport`,
`requiresNativeSupport` or equivalent model-authored policy flags. The LLM records
what the source contains. Deterministic code reads the fixed registry and decides
what the 3D scene does with that type.

## Source-review sidecar

For local verification, freeze a companion `component-review.json` containing
source evidence for exactly the same component IDs:

```json
{
  "schemaVersion":"plan2world-component-review-v2",
  "vocabularyVersion":"plan2world-components-v2",
  "components":[{
    "id":"c1",
    "image":{"x":0.4,"y":0.2},
    "evidence":"A projecting outer wall with visible glazing, not a storage unit."
  }]
}
```

The sidecar deliberately does **not** repeat type, floor, geometry references or
scene policy. That prevents a verification artifact from silently changing what
the application imports. `image` is normalized on the unchanged original raster;
`evidence` states the visible reason for recognition.

Run:

`python scripts/check-component-review.py --review component-review.json --draft draft.json`

The checker validates evidence IDs against draft components, same-floor geometry
references, required geometry kinds and the deterministic scene policy. It reports
`ignoredSceneComponents` for intentional 3D no-ops and `unmodeledComponents` for
registry types whose visible scene effect is not yet implemented. Source evidence
and source-overlay alignment remain separate visual checks.

## Deterministic scene policy

The fixed registry has two code-owned fields for each type:

- `sceneEffect`: what kind of scene consequence the type represents.
- `sceneSupport`: `ignore`, `existing-geometry`, or `unsupported`.

`ignore` means recognition is retained but no dedicated 3D object is created.
`existing-geometry` means referenced walls/windows/floorAreas already own the
scene result; the component itself creates no second object. `unsupported` means a
user-perceptible scene effect still needs deterministic native support.

For example, a sealed `shaft` is `boundary-only / existing-geometry`: its correct
visible enclosure walls matter, but the hidden cavity does not require a special
slab hole. `window_ledge` and `equipment_ledge` are `evidence-only / ignore`.
`column`, `stair`, `floor_void`, visible built-in `planter` and standalone
`railing` remain explicit scene-support gaps until their deterministic handlers
exist.

## Source-fidelity gate

Wall position belongs to the visible source trace. Trace wall centrelines in the
original raster first. Printed dimensions, dimension chains and scale bars may
constrain scale or distances; they do not supply wall x/y coordinates. Never
accumulate dimension-chain subdivisions and substitute those cumulative values
for visually traced wall positions.

Before A can pass, reproject the complete transformed wall network onto the
unchanged source with the same uniform transform. Do not independently fit
registration to hide drift. An obvious or systematic centreline mismatch is an
A-layer failure: preserve the failed candidate, stop, fix the reusable
reconstruction instructions and generate a fresh candidate from the original.
Do not continue to contract, native conversion or rendering.

## Ownership and vertical risks

- A component describes a feature; referenced geometry owns its shape exactly once.
- Wall piers are not duplicate columns. Bays are not furniture. Shafts and equipment
  ledges are not living floor.
- Balcony policy may derive glazing from a supported balcony perimeter, but the
  balcony component still references the actual wall/window owners rather than a
  duplicate room mesh.
- Stair arrows establish only visible direction. Never infer unseen target floors,
  rises, holes or alignment between separate floor drawings.
- An unresolved stair target is reported separately from scene support.
