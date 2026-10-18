# Plan2World agent guide

## Mission

Plan2World turns a floor-plan image into an editable browser scene: first reconstruct the architectural geometry, then let the user correct geometry, choose styles for semantic furniture blocks, and walk the result in first person with Three.js.

The existing openPlan3D editor is the downstream engine. Do not replace working drawing, furniture, persistence, or 3D walkthrough systems unless a task specifically requires it.

## Core pipeline

1. Inspect a JPG/PNG floor plan.
2. Trace outer wall centrelines, identify real furniture from the fixed vocabulary in that context, complete the shared interior walls and source-supported closure, then extract hosted doors/windows. Use the provider-neutral `skills/reconstruct-plan2world` procedure.
3. Emit `plan2world-draft-v1` JSON.
4. Validate and normalize that JSON.
5. Convert it into the existing `Project` model in `src/lib/models/types.ts`.
6. Open the result in the existing editor for correction, native-object style selection, furniture placement, and first-person walkthrough.

The AI boundary is the draft JSON. Keep model-provider-specific code outside the core editor.

## Product invariants

- 2D editing and first-person walkthrough are equally important. `Tab` should remain a fast way to move between editing and experience.
- A generated plan is a draft, not ground truth. The user must be able to correct walls, openings, scale, and furniture manually.
- Never require BIM/Revit for the core workflow.
- Do not add a mandatory cloud backend or paid model dependency. Local/manual JSON import must remain possible.
- Keep the project usable as a normal floor-plan editor when AI features are unavailable.
- Preserve upstream MIT attribution.

## Geometry contract

Use `schemas/plan2world-draft-v1.schema.json` and `docs/plan2world-draft-v1.md`.

Important conventions:

- Lengths are centimetres.
- A wall is represented by its centreline start/end points plus thickness and height.
- Doors/windows reference an existing wall by `wallId` and use `position` in `[0, 1]` along that wall.
- If a drawing contains a trustworthy dimension, use it as the scale anchor.
- If no trustworthy scale exists, mark the scale as estimated and state the assumption; do not present guessed dimensions as measured facts.
- Use straight segments for straight walls and native quadratic `curvePoint` for visible curves. Do not approximate a simple arc with tiny facets.

## Coding guidance

- TypeScript/SvelteKit/Three.js are the current stack.
- Reuse `Project`, `Floor`, `Wall`, `Door`, `Window`, and `FurnitureItem` from `src/lib/models/types.ts` rather than creating a competing scene graph.
- Keep parsing/normalization as pure functions where possible so they are testable without a browser.
- Reject malformed references, duplicate IDs, non-finite coordinates, negative dimensions, and openings that do not reference a known wall.
- Defaults belong in one normalization layer, not scattered through UI components.
- Do not silently invent architectural details that are not present in the source image.

## Default v1 assumptions

When the source gives no better information:

- wall height: 280 cm
- interior wall thickness: 12 cm
- exterior wall thickness: 20 cm
- single door width: 90 cm
- door height: 210 cm
- window sill height: 90 cm
- window height: 120 cm

These are editable defaults, not claims about the source building. The opt-in `semantic-white-model` presentation instead defaults omitted windows to sill 0, host-wall height and fixed glass. Semantic furniture requires `imported_object`, `sourceCategory` and approximate centre position. Dimensions and rotation are optional: reuse the existing imported-object 50 cm cube and zero rotation; users refine these later. Supplied dimensions must remain positive. Drafts without the presentation retain the legacy defaults above. User-chosen styling must preserve native IDs, placement and dimensions.

When an SVG review looks wrong, preserve the JSON and determine whether the source-to-JSON extraction or JSON-to-SVG projection is incorrect. Repair the responsible reusable Skill/script or renderer and test that stage. Hand-correcting a candidate is not evidence of Skill improvement; do not compensate in 3D. Furniture extraction acceptance covers presence, semantic type and broad position, not direction, dimensions or fine alignment.

Current reconstruction must declare `furnitureVocabulary: "plan2world-furniture-v1"` and use exact IDs from `skills/reconstruct-plan2world/references/furniture-vocabulary.json`. Confirm object presence before choosing its type; bay windows, ledges, wall piers and planter platforms do not become furniture. Omit unsupported/unconfirmed objects and disclose their region/reason in assumptions. Do not invent labels or use unknown/other furniture placeholders. Keep extraction semantics separate from user-selectable model/style catalogs. Historical drafts without a vocabulary version remain import-compatible.

During reconstruction verification, freeze each complete emitted JSON before checking it and never hand-edit that output after a failure. Change the responsible reusable Skill/script or conversion/viewing program, then generate a separate new output for any retest. SVG is a temporary intermediate diagnostic for image-to-JSON reliability, not a product goal.

## Verification

Before merging implementation changes, run the relevant subset and preferably all of:

```bash
npm test
npm run check
npm run build
```

For UI/3D changes, also run the existing Playwright/browser checks when practical.

## MVP scope

The first useful release should support:

- one floor-plan JPG/PNG as source evidence;
- one scale anchor or explicit estimated-scale mode;
- straight walls;
- doors and windows;
- conversion into the existing editable project format;
- furniture placement using the existing catalog;
- first-person walkthrough using the existing viewer.

Avoid expanding into BIM, photorealistic rendering, structural analysis, or automatic interior design until this loop is reliable.
