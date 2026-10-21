# Plan2World

**Floor-plan image → deterministic reconstruction → editable Three.js home → first-person walkthrough.**

Plan2World is an MIT-licensed project built on [openPlan3D](https://github.com/laanlabs/openPlan3D). It keeps the existing deterministic editor/project/viewer and adds a provider-neutral floor-plan reconstruction layer.

## Current pipeline

```text
floor-plan JPG / PNG / WebP
  → source-architecture-v1 (functional zones + walls + openings + scale evidence)
  → freeze raw architectural observations
  → source-furnishing-v1 (furniture semantics / positions only)
  → raster refinement / functional-zone logical closure / opening audit
  → freeze final architecture and guiding furniture anchors
  → deterministic plan2world-draft-v1 assembly
  → Review / native Project
  → 2D edit ⇄ 1.20 m cut ⇄ 3D ⇄ first-person walkthrough
```

The model observes source evidence. Programs own topology, calculations, IDs, host matching, conversion, room analysis, collision and rendering.

The direct Skill / CLI and browser provider use the same sequence. Browser prompts
load the portable architecture and furnishing references directly. Every accepted
opening must have a source-supported host baseline; unresolved hosts block normal
assembly. Furniture anchors reach the program before final closure. Direct Skill
runs do not certify external-model quality.

Initial reconstructed doors/windows extend from floor to host wall height, with
window sill 0. These are editable starting values, not measurements inferred from
the raster. Furniture extraction remains semantics and position only.

Functional zones and architecture are observed together, followed by the
furniture-only observation. The program verifies independent native regions,
inserts source-supported leafless thresholds and balcony air/railing boundaries,
and evaluates bounded connections of observed wall endpoints. See
[functional zones](docs/functional-zones.md) and
[furniture-guided closure](docs/furniture-guided-closure.md).

Original-pixel raster evidence supports conservative refinement. Background
sampling uses accepted architectural bounds and an interior grid to avoid photo
frames; ambiguous backgrounds disable raster assistance. Sampling never crops
coordinates or authorizes walls. Centerline correction remains disabled; see
[raster background](docs/raster-background.md) and
[centerline policy](docs/raster-centerlines.md).

## Current reconstruction scope

- straight and quadratic wall centrelines;
- hosted doors/windows derived from source-space endpoints;
- deterministic scale conversion and source registration;
- source-pixel near-miss review and approximate native indoor connectivity diagnostics;
- fixed-vocabulary imported furniture blocks;
- optional source-supported `floorAreas`;
- declared balcony enclosure policy;
- conversion into the existing editable native model with no parallel scene graph.

A reconstruction is evidence-bearing input, not ground truth. Unsupported source details should be omitted or disclosed rather than invented.

## Fresh validation

Five difficult real-plan samples are identified only by source metadata in `tests/fixtures/real-floorplans/reconstruction-corpus/manifest.json`. Fresh run artifacts go to a new ignored `.plan2world-validation/runs/<run-id>/<sample-id>/` directory and are never checked in as fixtures.

Human source references are physically separated under `tests/evaluation/plan2world/source-references/` and are post-hoc evaluation truth. Do not inspect them until the fresh evidence, assembled draft and source overlay are generated and frozen.

Historical model outputs and validation diaries are intentionally absent from the active tree; Git history is the archive.

## Important references

- [`AGENTS.md`](AGENTS.md) — project invariants and validation rules;
- [`skills/reconstruct-plan2world/SKILL.md`](skills/reconstruct-plan2world/SKILL.md) — active reconstruction procedure;
- [`docs/plan2world-draft-v1.md`](docs/plan2world-draft-v1.md) — concise draft contract;
- [`schemas/plan2world-draft-v1.schema.json`](schemas/plan2world-draft-v1.schema.json) — machine schema;
- [`FEATURES.md`](FEATURES.md) — current capability summary.

## Run locally

Use Node.js 24 (see `.nvmrc`):

```bash
git clone https://github.com/6jingyong/plan2world.git
cd plan2world
npm ci
npm run dev
```

Core checks:

```bash
npm test
npm run check
npm run build
```

## Architecture principles

- SvelteKit + Three.js remain the application stack.
- Keep the existing openPlan3D native model rather than introducing a second geometry store.
- Keep provider-specific transport outside editor core.
- Keep geometry checks, room analysis, collision and rendering deterministic.
- Keep local/manual JSON import available.
- Preserve upstream MIT attribution.
