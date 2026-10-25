# Plan2World

**Floor-plan image → deterministic reconstruction → editable browser home → engine-neutral runtime artifacts → first-person runtime.**

Plan2World is an MIT-licensed project built on [openPlan3D](https://github.com/laanlabs/openPlan3D). It keeps the existing deterministic editor/project/viewer and adds a provider-neutral floor-plan reconstruction layer plus a deterministic runtime compilation boundary.

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
  → browser 2D edit ⇄ 1.20 m cut ⇄ 3D review
  → deterministic runtime compiler
      ├─ plan2world-runtime-v1       (semantics / collision / interaction)
      ├─ architecture.glb            (static architectural presentation)
      └─ assets manifest + GLBs        (furniture / dynamic door leaves)
  → Godot runtime + native top-view furniture layout
```

The model observes source evidence. Programs own topology, calculations, IDs, host matching, conversion, room analysis, collision contracts and runtime compilation.

The direct Skill / CLI and browser provider use the same reconstruction sequence. Browser prompts load the portable architecture and furnishing references directly. Every accepted opening must have a source-supported host baseline; unresolved hosts block normal assembly. Furniture anchors reach the program before final closure. Direct Skill runs do not certify external-model quality.

Initial reconstructed doors/windows extend from floor to host wall height, with window sill 0. These are editable starting values, not measurements inferred from the raster. Furniture extraction remains semantics and position only.

Functional zones and architecture are observed together, followed by the furniture-only observation. The program verifies independent native regions, inserts source-supported leafless thresholds and balcony air/railing boundaries, and evaluates bounded connections of observed wall endpoints. See [functional zones](docs/functional-zones.md) and [furniture-guided closure](docs/furniture-guided-closure.md).

Original-pixel raster evidence supports conservative refinement. Background sampling uses accepted architectural bounds and an interior grid to avoid photo frames; ambiguous backgrounds disable raster assistance. Sampling never crops coordinates or authorizes walls. Centerline correction remains disabled; see [raster background](docs/raster-background.md) and [centerline policy](docs/raster-centerlines.md).

## Current reconstruction scope

- straight and quadratic wall centrelines;
- hosted doors/windows derived from source-space endpoints;
- deterministic scale conversion and source registration;
- source-pixel near-miss review and approximate native indoor connectivity diagnostics;
- fixed-vocabulary imported furniture blocks;
- optional source-supported `floorAreas`;
- declared balcony enclosure policy;
- conversion into the existing editable native model with no parallel authoring scene graph.

A reconstruction is evidence-bearing input, not ground truth. Unsupported source details should be omitted or disclosed rather than invented.

## Runtime boundary

The native Plan2World `Project` is the authoring truth. Runtime backends do not read raster evidence, LLM observations, or repair authoring topology.

`npm run runtime:export` compiles a saved native Project into sibling engine-neutral artifacts:

```text
house.runtime.json        # plan2world-runtime-v1 semantics, collision, interaction
house.architecture.glb    # deterministic architectural presentation mesh
house.assets/manifest.json # asset identities, integrity and compiler-owned fit transforms
house.assets/<sha256>.glb  # referenced catalog/custom models and shared door leaf
```

Runtime JSON now carries explicit engine-neutral floor collision triangles as well as wall/furniture/column primitives and door interaction contracts. Godot consumes those colliders directly for grounded gravity/floor-snapped `CharacterBody3D` motion; it never derives physics from GLB. Single/double/french swing and sliding/pocket doors use explicit per-leaf runtime motion semantics, while unsupported fold/overhead motion remains a closed blocker rather than being approximated as a hinge.

Authored railing boundaries now have shared GLB presentation at their native height/thickness; air boundaries remain invisible with collision.

The Godot adapter consumes these artifacts separately: runtime JSON owns behavior/collision, architecture GLB owns static presentation, and the asset manifest resolves replaceable furniture and dynamic leaves. Catalog GLBs reuse the existing catalog mapping; custom GLBs reuse verified Project attachments. Missing models use compatibility proxies. The browser provides orbit navigation, 3D editing/review, floor stacks, architectural cuts and photo-camera previews. Browser FPS locomotion and physics have been removed; native spawn editing is retained for compiled runtime use. Future Unity/Unreal/Web runtimes should consume the same compiled boundary rather than translating from Godot.

The editor's **Export → Export runtime scene (.zip)** uses the same compiler as
`npm run runtime:export -- house.project.json --package house.runtime.zip`.
Extract the scene ZIP and open its runtime JSON in the separate standalone
Plan2World Runtime player. Windows/Linux player builds, offline use and delivery
verification are described in [runtime delivery](docs/runtime-delivery.md).
The player pauses on focus loss and provides manual return to its compiled spawn
while preserving the current world's door state and geometry.
Godot now switches between perspective first person and orthographic top view in the same 3D world. Its native furniture layout tools support add/move/rotate/replace/remove, native Project save and runtime export, without undo/history. Top-view dragging offers a 10cm grid, straight-wall flush/orientation and furniture guides, with visible toggles and Alt to release. The native arrangement view keeps the room central, opens a searchable category/tile catalog with Tab, and shows actions only for the selected piece. Save/export live in the secondary Layout menu; the walking HUD stays compact. First-person furniture adjustment uses small keyboard/gamepad nudges; floor furniture stays on its floor and mounted objects stay on their explicit wall; architecture stays fixed. Delivered players include the offline shared data/compiler core and need no browser. See [native furniture layout](docs/godot-furniture-layout.md) and [`runtime/godot/README.md`](runtime/godot/README.md).

Furniture must leave the compiled closed-door volumes clear, including when a
door is currently open. Shared export validation and native placement preview
enforce this rule so saved layouts reopen without door/furniture clipping.

## Fresh validation

Five difficult real-plan samples are identified only by source metadata in `tests/fixtures/real-floorplans/reconstruction-corpus/manifest.json`. Fresh run artifacts go to a new ignored `.plan2world-validation/runs/<run-id>/<sample-id>/` directory and are never checked in as fixtures.

Human source references are physically separated under `tests/evaluation/plan2world/source-references/` and are post-hoc evaluation truth. Do not inspect them until the fresh evidence, assembled draft and source overlay are generated and frozen.

Historical model outputs and validation diaries are intentionally absent from the active tree; Git history is the archive.

## Important references

- [中文使用说明书：插件 / Skill 与独立桌面工具](docs/user-guide.zh-CN.md) — 账户、原图重建、正交俯视、布置与保存；
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

Core CI runs the TypeScript/catalog/unit/build/audit gates plus a pinned Godot 4.7.2 headless project parse, built-in runtime-demo boot and native Project → packaged assets → Godot integration and actual grounded walkthrough checks. Local code checks are:

```bash
npm test
npm run check
npm run build
```

## Architecture principles

- SvelteKit + Three.js own browser authoring, correction, review and quick preview.
- Keep the existing openPlan3D native `Project` as the authoring model rather than introducing a competing scene graph.
- Compile runtime semantics/collision and presentation geometry deterministically from that native Project.
- Keep runtime artifacts engine-neutral; Godot is a consumer, not a second source of truth.
- Keep provider-specific transport outside editor core.
- Keep local/manual JSON import and offline runtime export available; AI must not be mandatory.
- Preserve upstream MIT attribution.

Current product scope, snapping controls and publication readiness are tracked in [native Godot layout](docs/godot-furniture-layout.md). The [integration acceptance recipe](docs/runtime-integration.md) covers a normally saved real-house Project, complementary complex geometry, full browser regressions and rendering benchmarks.
