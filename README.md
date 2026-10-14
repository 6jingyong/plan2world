# Plan2World

**Floor-plan image → editable Three.js home → first-person walkthrough.**

Plan2World is an MIT-licensed experiment built on top of [openPlan3D](https://github.com/laanlabs/openPlan3D). The goal is deliberately simpler than BIM: upload a normal floor-plan image, reconstruct the visible geometry into an editable browser scene, place furniture, then walk through the result in first person.

## Workflow

```text
floor-plan JPG / PNG / WebP
        ↓
vision-capable provider (BYOK) or external agent
        ↓
plan2world-draft-v1 JSON
        ↓
validation + normalization
        ↓
existing editable project model
        ↓
2D furniture editing  ⇄  Three.js first-person walkthrough
```

The AI is intentionally kept outside the core renderer. A model only needs to understand the image and produce the documented draft format; it does not need to know Svelte, Three.js, editor history, materials, persistence, or BIM.

## Current status

The underlying editor already provides:

- 2D wall, door, window, stair, room, and annotation editing;
- a categorized furniture catalog with placement, rotation, resizing, and snapping;
- real-time Three.js 3D preview;
- first-person walkthrough;
- local project persistence and JSON import/export;
- material and lighting controls.

Plan2World adds the image reconstruction layer:

- upload PNG, JPEG, or WebP floor-plan images from the welcome screen;
- optionally provide a scale hint such as a known dimension or drawing scale;
- call the configured vision-capable provider directly from the browser;
- prefer visible dimensions and scale bars before estimating scale;
- label estimated scale explicitly instead of presenting guessed measurements as exact;
- reconstruct straight walls, doors, and windows into `plan2world-draft-v1`;
- validate references and geometry before converting into the native editor project;
- run the existing room detector rather than asking the model to invent room polygons;
- continue editing the result with the existing furniture and first-person tools.

The same draft format remains usable without the built-in provider flow. Codex, DeepSeek Harness, or another vision-capable agent can generate a draft JSON file externally and import it through the normal JSON import action.

## Privacy and provider model

Plan2World does not require a Plan2World AI backend. The built-in image flow reuses the editor's existing bring-your-own-provider settings.

When you generate a home from an image:

1. the browser reads the selected image locally;
2. the browser sends it directly to the provider URL you configured;
3. the provider returns JSON geometry;
4. Plan2World validates that JSON locally and opens it as an editable project.

Plan2World does not proxy or store the uploaded floor-plan image in this flow. Provider billing, retention, supported models, CORS behavior, and data handling are governed by the provider you choose.

## v1 scope

Keep the first useful version small:

1. one floor-plan image;
2. one floor;
3. straight walls;
4. doors and windows;
5. either a trustworthy scale anchor or an explicitly estimated scale;
6. import into the existing editor;
7. manual correction and furniture placement;
8. first-person walkthrough.

Not v1: BIM/Revit, structural analysis, automatic architectural-code checking, photorealistic rendering, or automatic interior-design recommendations.

## Draft format

A reconstruction provider or agent should output `plan2world-draft-v1`, for example:

```json
{
  "schemaVersion": "plan2world-draft-v1",
  "name": "Apartment",
  "units": "cm",
  "scale": {
    "mode": "measured",
    "confidence": 0.98,
    "basis": "Visible 360 cm dimension"
  },
  "floors": [
    {
      "id": "floor-0",
      "name": "Ground Floor",
      "level": 0,
      "walls": [
        {
          "id": "w1",
          "start": { "x": 0, "y": 0 },
          "end": { "x": 360, "y": 0 },
          "thickness": 20
        }
      ],
      "doors": [],
      "windows": [],
      "furniture": []
    }
  ]
}
```

See:

- [`docs/plan2world-draft-v1.md`](docs/plan2world-draft-v1.md) — human-readable contract;
- [`schemas/plan2world-draft-v1.schema.json`](schemas/plan2world-draft-v1.schema.json) — machine-readable schema;
- [`examples/plan2world-draft-v1.example.json`](examples/plan2world-draft-v1.example.json) — complete example;
- [`src/lib/plan2world/draft.ts`](src/lib/plan2world/draft.ts) — runtime parser and native project conversion.

## Run locally

Plan2World currently inherits the upstream toolchain. Use Node.js 24 (see `.nvmrc`) and npm:

```bash
git clone https://github.com/6jingyong/plan2world.git
cd plan2world
npm ci
npm run dev
```

Open `http://localhost:5173`.

Useful checks:

```bash
npm test
npm run check
npm run build
```

The upstream project contains a much larger browser regression suite and rendering benchmarks; see [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`FEATURES.md`](FEATURES.md).

## Using the built-in image flow

1. Open Plan2World and choose **Generate from floor-plan image**.
2. Expand **AI provider → Configure** on first use and save a vision-capable provider/model.
3. Drop in a PNG, JPEG, or WebP plan.
4. If the drawing has no usable dimensions, optionally add a scale hint.
5. Generate the editable home.
6. Correct any uncertain geometry in 2D, place furniture, then switch to 3D/walkthrough.

Furniture recognition from the source plan is optional and off by default. The intended workflow is to reconstruct the architecture first and use the existing catalog for furnishing.

## Working with Codex or another external agent

Open this repository as the working directory and give the agent the source floor-plan image. `AGENTS.md` defines the architectural contract and v1 constraints.

A useful task is:

```text
Read AGENTS.md and docs/plan2world-draft-v1.md.
Inspect the attached floor-plan image.
Create a plan2world-draft-v1 JSON file using visible dimensions where available.
Do not invent precise measurements when the scale is unknown; record assumptions.
Validate references between walls, doors, and windows.
```

Then use Plan2World's JSON import action to open the generated draft. This keeps Codex, DeepSeek Harness, or another model interchangeable: the application contract is JSON, not a single vendor API.

## Upstream and license

Plan2World is forked from [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D) and keeps the upstream MIT license and copyright notice. The original editor remains the foundation for 2D editing, furniture placement, persistence, and Three.js walkthrough functionality.

This repository is licensed under the [MIT License](LICENSE). Third-party models/assets may have their own attribution or license requirements; retain the existing model-source records when redistributing them.

## Direction

The product test is simple: **can a normal person upload a flat apartment plan, correct any AI mistakes in a familiar editor, place a sofa and bed, press Tab, and walk through the home?**

If that loop works reliably, more sophisticated model integrations should remain adapters/plugins rather than becoming architectural dependencies.
