---
name: reconstruct-plan2world
description: Reconstruct a floor-plan image by extracting source evidence, then hand deterministic geometry, math and assembly to Plan2World programs.
---

# Reconstruct Plan2World

Core rule: **LLM observes; programs calculate and assemble.**

Read stage references only when entering that stage:

- [references/wall-trace.md](references/wall-trace.md)
- [references/annotation-pass.md](references/annotation-pass.md)
- [references/opening-trace.md](references/opening-trace.md) for deterministic opening behavior
- [references/contract.md](references/contract.md) for the final draft contract
- [references/furniture-vocabulary.json](references/furniture-vocabulary.json) for exact furniture categories

Pipeline:

**source raster → LLM wall evidence → deterministic Bare House → LLM semantic evidence → deterministic draft assembly → application**

## Fresh validation workspace

For a benchmark rerun, start from the original raster and create a new ignored directory before generating anything:

`.plan2world-validation/runs/<run-id>/<sample-id>/`

Never use an existing run directory as reconstruction input and never write generated artifacts under `tests/fixtures`. The reconstruction-side corpus manifest contains source identity only. Do not inspect `tests/evaluation/plan2world/source-references/` until the draft and source overlay for the fresh run are generated and frozen.

Use the run directory for every generated stage artifact, for example:

- `wall-trace.json`
- `bare-house.json`
- `source-annotation.json`
- `draft.json`
- review overlay files
- post-hoc `evaluation.json`

Historical runs belong in Git history or disposable local run directories, not active fixtures.

## A. Wall evidence

Use the unchanged source raster and emit only `source-wall-trace-v1` as defined in `wall-trace.md`. Do not calculate topology, scale or final geometry.

Hand the new evidence directly to the normalizer:

`node tooling/normalize-plan2world-wall-graph.mjs --trace "$RUN_DIR/wall-trace.json" > "$RUN_DIR/bare-house.json"`

The program owns junction detection, wall splitting, endpoint snapping and enclosure validation. If it rejects the trace, repair source evidence only when the trace is visually wrong. A program error is not permission for an LLM topology workaround.

## B. Source annotation

After Bare House geometry is accepted, use the original raster plus Bare House geometry as context and emit only `source-annotation-v1` as defined in `annotation-pass.md`.

The model may identify scale evidence, opening existence/endpoints/operation and fixed-vocabulary furniture. It must not choose opening host IDs or emit calculated opening width/position, cm-per-pixel, cm coordinates, source-registration anchors or final draft structure.

Assemble deterministically:

`node tooling/assemble-plan2world-draft.mjs --bare-house "$RUN_DIR/bare-house.json" --annotations "$RUN_DIR/source-annotation.json" --source-width W --source-height H > "$RUN_DIR/draft.json"`

The assembler owns unit conversion, scale math, opening host association, projection/width/position, furniture coordinate conversion, fixed `catalogId`, source-registration anchors, warning collection and final `plan2world-draft-v1`.

## C. Validate, then hand off

Validate the assembled draft with deterministic tooling. Use source overlay only as a source-fidelity diagnostic; registration must come from the same original-pixel transform used by the assembler and must never be refitted to hide drift.

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft "$RUN_DIR/draft.json" --source source.jpg --width W --height H --require-furniture-vocabulary true`

Only after the fresh draft and overlay are frozen may post-hoc evaluation read `tests/evaluation/plan2world/source-references/`.

Once the draft is accepted, stop reconstructing. The existing application owns native room derivation, 2D/3D conversion, collision, walkthrough, editing and assets.

## Failure ownership

Always fix the earliest wrong artifact:

- wrong visible wall evidence → wall LLM pass;
- wrong split/snap/topology → normalizer/program;
- wrong opening/furniture/scale evidence → annotation LLM pass;
- wrong host match, cm conversion, opening width/position, registration, schema or IDs → assembler/program;
- wrong rooms/rendering/collision/walkthrough → downstream application.

Never repair a deterministic-stage bug by adding more LLM instructions. Never hand-edit a rejected generated artifact to make a later screenshot or test pass.
