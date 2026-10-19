# Plan2World

**Floor-plan image → frozen reconstruction draft → editable Three.js home → first-person walkthrough.**

Plan2World is an MIT-licensed project built on top of [openPlan3D](https://github.com/laanlabs/openPlan3D). It keeps the existing deterministic editor, project model and Three.js viewer, and adds a provider-neutral floor-plan reconstruction layer.

## Current pipeline

```text
floor-plan JPG / PNG / WebP
        ↓
reconstruct-plan2world Skill
        ↓
plan2world-draft-v1 JSON
        ↓
validation + Review
        ↓
existing native Project model
        ↓
2D edit ⇄ 1.20 m architectural cut ⇄ 3D ⇄ first-person walkthrough
```

The AI boundary is the draft JSON. Geometry validation, conversion, room analysis, editing, collision and rendering remain deterministic application code.

## Current reconstruction scope

The current reconstruction contract supports:

- zero-width wall centrelines with straight segments and native quadratic curves;
- hosted doors and windows referenced to existing walls;
- source registration, scale evidence and reconstruction assumptions;
- source-derived semantic furniture blocks using the fixed `plan2world-furniture-v1` vocabulary;
- optional source-supported open-ground outlines through `floorAreas`;
- the declared balcony policy: recognized balconies/terraces default to independent enclosed glazed rooms unless source evidence triggers the policy guard;
- conversion into the existing editable `Project` model without a parallel scene graph;
- native 2D correction, semantic-block style replacement, 3D inspection and first-person walkthrough.

A draft is evidence-bearing input, not ground truth. Ambiguous or unsupported source details should be disclosed rather than invented.

## Validation rule

For reconstruction validation, treat each emitted draft as immutable evidence:

1. generate a fresh draft from the source image and the current Skill;
2. freeze that complete JSON before inspecting downstream output;
3. if a stage fails, identify the earliest incorrect artifact;
4. repair the responsible reusable Skill, converter, editor, viewer or walkthrough code;
5. generate a separate fresh output for the retest.

Do **not** hand-edit a failed JSON or 3D/native project to make a validation case pass. SVG overlays are diagnostic aids for image-to-JSON review, not a product output.

## Important references

- [`AGENTS.md`](AGENTS.md) — project invariants and validation rules for coding agents;
- [`skills/reconstruct-plan2world/SKILL.md`](skills/reconstruct-plan2world/SKILL.md) — provider-neutral reconstruction procedure;
- [`docs/plan2world-draft-v1.md`](docs/plan2world-draft-v1.md) — human-readable draft contract;
- [`schemas/plan2world-draft-v1.schema.json`](schemas/plan2world-draft-v1.schema.json) — machine-readable schema;
- [`FEATURES.md`](FEATURES.md) — current Plan2World-focused capability reference;
- [`docs/reviews/2026-10-17-semantic-white-model.md`](docs/reviews/2026-10-17-semantic-white-model.md) and [`docs/reviews/2026-10-18-open-ground.md`](docs/reviews/2026-10-18-open-ground.md) — retained current validation records.

Historical QA reports and development diaries are intentionally not kept in the current tree; Git history remains the archive.

## Run locally

Use Node.js 24 (see `.nvmrc`) and npm:

```bash
git clone https://github.com/6jingyong/plan2world.git
cd plan2world
npm ci
npm run dev
```

The development server normally opens on `http://localhost:5173`.

Core checks:

```bash
npm test
npm run check
npm run build
```

For a production-server Chromium smoke test, build first and use the repository's normal Playwright config:

```bash
npm run build
npx playwright install chromium
npx playwright test tests/browser/walkthrough.spec.ts --project=chromium
```

`playwright.config.ts` starts `node build/index.js` itself. No separate `playwright.local.config.ts` is required by the repository.

## Architecture principles

- SvelteKit + Three.js remain the application stack.
- Keep using the existing openPlan3D `Project`/`Floor`/wall/opening/furniture model rather than introducing a second geometry store.
- Keep provider-specific transport outside the editor core.
- Preserve deterministic conversion, geometry checks, room analysis, collision and rendering.
- Keep local/manual JSON import possible; no mandatory AI backend is required.
- Keep upstream MIT attribution.

## Upstream and license

Plan2World is built on [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D) and retains the upstream MIT license and attribution. The upstream editor remains the foundation for native editing, persistence and Three.js walkthrough functionality.