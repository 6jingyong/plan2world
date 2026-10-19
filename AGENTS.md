# Plan2World agent guide

## Mission

Plan2World turns a floor-plan image into an editable browser home: reconstruct source-supported architecture and semantic furniture, review the reconstruction, convert it into the existing native project model, then edit and walk it in Three.js.

The existing openPlan3D editor is the downstream engine. Reuse its `Project`, editing, history, persistence, collision and viewer systems. Do not create a competing scene graph or replace working subsystems unless the task specifically requires it.

Walkthrough is not a read-only terminal state. The long-term runtime also supports selecting/replacing scene assets while preserving native entity identity; custom model/package infrastructure should be reused rather than replaced when that work begins.

## Canonical pipeline

1. Inspect the original JPG/PNG/WebP floor plan.
2. Apply `skills/reconstruct-plan2world/SKILL.md` from the source image.
3. Emit one complete `plan2world-draft-v1` JSON.
4. Freeze that JSON before downstream inspection.
5. Validate/Review it and convert it into the existing native `Project` model.
6. Inspect 2D, the 1.20 m architectural cut, 3D and first-person walkthrough.
7. Verify interaction/persistence where affected.
8. When a failure appears, identify the earliest incorrect artifact and repair only the reusable layer responsible for it.

The AI boundary is the draft JSON. Geometry validation, normalization, room analysis, editing, collision and rendering remain deterministic application code.

For repeatable validation, use the ordered stages in `src/lib/plan2world/validationRun.ts`. `reconstructionExperiment.ts` owns source/model/prompt identity; the validation run records the repository revision, draft candidate identity and the first failing boundary. A later boundary must not be recorded as passing while an earlier one has failed.

## Non-negotiable validation rule

A validation candidate is evidence, not a canvas for manual rescue.

- Never hand-edit a frozen JSON after finding a failure.
- Never move, add or delete native/3D geometry merely to make that candidate look correct or walkable.
- Never hide a downstream defect by compensating in an upstream artifact.
- If image → JSON is wrong, improve the reconstruction Skill/procedure and generate a separate fresh candidate.
- If the JSON contract is wrong, fix schema/parser rules without changing its intended semantics.
- If a validated JSON → native project conversion is wrong, fix conversion/normalization and retest the same frozen JSON.
- If native geometry is correct but cut/3D/walkthrough is wrong, fix the geometry/viewer/collision/entry layer that first diverges.
- SVG/overlay output is only a diagnostic for image-to-JSON review; it is not a product goal or alternate source of truth.

Record the earliest failing stage. A polished final screenshot does not count as validation if an earlier stage was manually corrected.

## Reconstruction contract

Use `schemas/plan2world-draft-v1.schema.json` and `docs/plan2world-draft-v1.md`.

Important conventions:

- Lengths are centimetres.
- Walls are zero-width centrelines in the draft. Use straight segments for straight walls and native quadratic `curvePoint` geometry for visible curves; do not facet a simple curve into many tiny lines.
- Omit optional positive wall thickness/height unless established. Normalization supplies physical defaults; never emit thickness `0`.
- Doors/windows reference an existing wall with `wallId` and a path position in `[0, 1]`.
- Use trustworthy visible dimensions/scale anchors when available. If scale is estimated, label it as estimated and disclose the basis.
- Current semantic reconstruction declares `furnitureVocabulary: "plan2world-furniture-v1"` and uses exact IDs from `skills/reconstruct-plan2world/references/furniture-vocabulary.json`.
- Confirm an object is actually furniture before typing it. Bay windows, ledges, piers, planter platforms, shafts and voids do not become furniture.
- Omit unsupported or unconfirmed objects and disclose the affected source region/reason instead of inventing an `unknown` placeholder.
- Furniture extraction acceptance is presence, semantic type and broad position. Fine orientation/dimensions are editable estimates unless source evidence supports them.
- Source-explicit open ground may use `floorAreas`; do not add fake walls solely to close a floor polygon.

## Balcony policy

Recognized balconies/terraces default to independent enclosed glazed rooms as a declared product assumption. Trace source-supported perimeter geometry, reuse continuous house-side hosts once, and place hosted outer windows except where the source visibly shows solid wall/pier structure.

Disclose the affected host/window IDs and source region as a policy assumption. Do not invent missing boundaries, apply the policy to access passages/equipment platforms/shafts/voids, or create a duplicate `floorArea`. Historical/manual open `floorAreas` remain import-compatible.

## Native defaults

When the source gives no better information, the legacy normalization defaults remain editable assumptions:

- wall height: 280 cm
- interior wall thickness: 12 cm
- exterior wall thickness: 20 cm
- single door width: 90 cm
- door height: 210 cm
- window sill height: 90 cm
- window height: 120 cm

The opt-in `semantic-white-model` presentation instead defaults omitted windows to floor-level, host-wall-height fixed glass. Semantic furniture uses native imported objects/blocks and can later be replaced with local styles while preserving native identity, placement and dimensions.

## Product invariants

- 2D correction and first-person walkthrough are equally important; `Tab` remains a fast transition between editing and experience.
- Walkthrough remains an editable runtime view, not a separate scene graph. Future furniture/model replacement must resolve back to stable native entity IDs.
- Wall-mounted decor such as artwork belongs to a future hosted-asset model, not to door/window opening geometry and not to anonymous Three.js meshes.
- Generated geometry is a draft, not ground truth. Source evidence and assumptions must remain inspectable.
- Keep local/manual JSON import possible; do not require a mandatory cloud backend or paid provider.
- Keep Plan2World usable as a normal floor-plan editor when AI features are unavailable.
- Keep existing custom-model/project-package primitives available for future user-imported assets.
- Preserve upstream MIT attribution.
- Do not expand the core reliability task into BIM, structural analysis or photorealistic interior design.

## Responsibility boundaries

Use the earliest wrong artifact to decide where to fix:

- A — source image → draft JSON: reconstruction Skill/procedure;
- B — draft JSON → validated draft: draft contract/schema/parser;
- C — validated draft → native `Project`: normalization/conversion;
- D — native project → 2D/cut/3D: deterministic geometry analysis or renderer;
- E — correct scene → failed movement/entry: walkthrough world, collision or spawn;
- F — correct runtime → failed interaction/save/reload: input, camera, persistence/package layer;
- G — runtime scene → asset replacement/import/hosted decor: future scene-asset editing layer, built on native IDs and existing custom-model/package infrastructure.

`src/lib/plan2world/draftContract.ts` owns B. `src/lib/plan2world/draftConverter.ts` owns C. `src/lib/plan2world/draft.ts` is only the backwards-compatible public facade. Do not put semantic repair into the converter merely because a later-stage workaround is easier.

## Verification

For implementation changes run the relevant focused tests and, before merge, normally:

```bash
npm test
npm run check
npm run build
```

For UI/3D/walkthrough changes also run the relevant Playwright browser regression. `playwright.config.ts` uses the production `build/` and starts `node build/index.js` itself.

After every reconstruction-Skill revision, perform at least one fresh application from an original raster and freeze/review its new output. Unit tests alone do not establish image-extraction quality.
