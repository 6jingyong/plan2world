---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image by extracting source evidence, then hand deterministic geometry, math and assembly to Plan2World programs.
---

# Reconstruct Plan2World

Core rule: **LLM observes; programs calculate and assemble.**

Read [references/deterministic-handoff.md](references/deterministic-handoff.md) first.
Read stage references only when entering that stage:

- [references/wall-trace.md](references/wall-trace.md)
- [references/annotation-pass.md](references/annotation-pass.md)
- [references/opening-trace.md](references/opening-trace.md) for opening-program behavior
- [references/contract.md](references/contract.md) for the final draft contract
- [references/furniture-vocabulary.json](references/furniture-vocabulary.json) for exact furniture categories

Pipeline:

**source raster → LLM wall evidence → deterministic Bare House → LLM semantic evidence → deterministic draft assembly → application**

## A. Wall evidence

Use the unchanged source raster and emit only `source-wall-trace-v1` as defined in
`wall-trace.md`. Do not calculate topology, scale or final geometry.

Immediately hand it to:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json > bare-house.json`

The program owns junction detection, wall splitting, endpoint snapping and enclosure
validation. Do not ask the model to imitate those operations.

If the program rejects the trace, repair source evidence only when the trace is
visually wrong. A program error is not permission for an LLM topology workaround.

## B. Source annotation

After Bare House geometry is accepted, use the original raster plus Bare House
geometry as context and emit only `source-annotation-v1` as defined in
`annotation-pass.md`.

The model may identify scale evidence, opening existence/endpoints/operation and
fixed-vocabulary furniture. It must not choose opening host IDs or emit calculated
opening width/position, cm-per-pixel, cm coordinates, source-registration anchors or
final draft structure.

Immediately hand Bare House + annotations + the known raster dimensions to:

`node tooling/assemble-plan2world-draft.mjs --bare-house bare-house.json --annotations annotations.json --source-width W --source-height H > draft.json`

The assembler owns unit conversion, scale math, opening host association,
projection/width/position, furniture coordinate conversion, fixed `catalogId`,
source-registration anchors, warning collection and final `plan2world-draft-v1`.

## C. Validate, then hand off

Run deterministic validation on the assembled draft. Use SVG/overlay only as a
source-fidelity diagnostic, not as another reconstruction stage. Registration must
come from the same original-pixel geometry and transform used by the assembler; do
not refit the overlay to hide wall drift.

Once the draft is accepted, stop reconstructing. Hand it to the existing application
for native room derivation, 2D/3D conversion, collision, walkthrough and editing.
Those are downstream program responsibilities, not LLM source interpretation.

## Failure ownership

Always fix the earliest wrong artifact:

- wrong visible wall evidence → wall LLM pass;
- wrong split/snap/topology → normalizer/program;
- wrong opening/furniture/scale evidence → annotation LLM pass;
- wrong host match, cm conversion, opening width/position, registration, schema or IDs → assembler/program;
- wrong rooms/rendering/collision/walkthrough → downstream application.

Never repair a deterministic-stage bug by adding more LLM instructions.
Never hand-edit a rejected generated artifact to make a later screenshot or test pass.
