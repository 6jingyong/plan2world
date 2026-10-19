# Plan2World agent guide

## Mission

Plan2World turns a floor-plan raster into an editable browser home while reusing the existing openPlan3D `Project`, editor, history, persistence, Three.js viewer and walkthrough. Do not create a competing scene graph.

## Canonical reconstruction

**source raster → wall evidence → deterministic Bare House → semantic evidence → deterministic draft assembly → native application**

- Wall evidence is `source-wall-trace-v1` in original image pixels.
- The normalizer owns intersections, splitting, snapping and evidenced door-gap connectivity.
- Semantic evidence is `source-annotation-v1`: scale evidence, openings and fixed-vocabulary furniture positions only.
- The assembler owns IDs, host matching, cm conversion, opening width/position, furniture catalog IDs, source registration and `plan2world-draft-v1`.
- The existing application owns room derivation, editing, rendering, collision, walkthrough and persistence.

Core rule: **LLM observes; programs calculate and assemble.**

## Fix the earliest wrong artifact

- wrong visible wall evidence → wall pass;
- wrong split/snap/topology → normalizer;
- wrong scale/opening/furniture evidence → annotation pass;
- wrong host match, units, IDs, registration or final draft → assembler/parser;
- wrong room/2D/3D/collision/walkthrough → downstream application.

Never compensate for a deterministic bug with prompt instructions. Never hand-edit a generated artifact to make a later screenshot pass.

## Fresh validation

Every image-quality rerun starts from the original raster and a new ignored directory:

`.plan2world-validation/runs/<run-id>/<sample-id>/`

Do not use an older run as input. Do not write generated wall traces, annotations, drafts, overlays or reports under `tests/fixtures`.

`tests/fixtures/real-floorplans/reconstruction-corpus/manifest.json` contains source identity only. Human source references live separately under `tests/evaluation/plan2world/source-references/` and may be read only after the fresh wall evidence, Bare House, annotations, draft and source overlay are generated and frozen.

Historical runs and development diaries belong in Git history, not the active tree.

## Draft invariants

Use `schemas/plan2world-draft-v1.schema.json` and `docs/plan2world-draft-v1.md`.

- lengths are centimetres;
- walls are zero-width centrelines with optional quadratic `curvePoint`;
- doors/windows reference existing walls;
- source registration, when present, is strict and must not fall back to independently fitted bounds;
- current semantic reconstruction declares `furnitureVocabulary: "plan2world-furniture-v1"`;
- fixed-vocabulary furniture uses `catalogId: "imported_object"` plus exact `sourceCategory` and source-supported position;
- `imported_object` renders as an editable native block; no project-wide presentation flag is required;
- ordinary missing window defaults remain 120 cm height, 90 cm sill and standard type;
- source-supported open ground may use `floorAreas`; never invent walls merely to force closure.

## Product invariants

- Keep 2D correction and first-person walkthrough on the same native geometry.
- Keep local/manual JSON import possible; AI must not be mandatory.
- Preserve existing custom-model/project-package infrastructure for future asset replacement.
- Generated geometry is evidence-bearing draft data, not ground truth.
- Preserve upstream MIT attribution.
- Do not expand reliability work into BIM, structural analysis or photorealistic reconstruction.

## Verification

Run relevant focused tests and normally, before merge:

```bash
npm test
npm run check
npm run build
```

For UI/3D/walkthrough changes, run the relevant Playwright regression. After any reconstruction-Skill change, also perform at least one fresh run from an original raster; unit tests alone do not establish image-extraction quality.
