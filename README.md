# Plan2World

**Floor-plan image → editable Three.js home → first-person walkthrough.**

Plan2World is an MIT-licensed experiment built on top of [openPlan3D](https://github.com/laanlabs/openPlan3D). The goal is deliberately simpler than BIM: give an AI agent a normal floor-plan image, turn the visible geometry into a small structured draft, open that draft in a real browser editor, place furniture, then walk through the result in first person.

## Target workflow

```text
floor-plan JPG / PNG
        ↓
Codex / DeepSeek Harness / another vision-capable agent
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

The underlying editor is already capable of:

- 2D wall, door, window, stair, room, and annotation editing;
- a categorized furniture catalog with placement, rotation, resizing, and snapping;
- real-time Three.js 3D preview;
- first-person walkthrough;
- local project persistence and JSON import/export;
- material and lighting controls.

The Plan2World bootstrap now adds:

- [`AGENTS.md`](AGENTS.md) — repository instructions for coding agents;
- [`docs/plan2world-draft-v1.md`](docs/plan2world-draft-v1.md) — the model-independent geometry contract;
- [`schemas/plan2world-draft-v1.schema.json`](schemas/plan2world-draft-v1.schema.json) — machine-readable validation schema;
- [`examples/plan2world-draft-v1.example.json`](examples/plan2world-draft-v1.example.json) — a complete example;
- [`src/lib/plan2world/draft.ts`](src/lib/plan2world/draft.ts) — validation, defaults, native `Project` conversion, and room detection;
- support for opening a `plan2world-draft-v1` file through the editor's existing JSON import path;
- regression tests for conversion and invalid wall references.

**The remaining missing front end is the image → draft step.** For now, a vision-capable agent can generate the draft JSON, and that JSON can already be imported into the editor.

## v1 scope

Keep the first useful version small:

1. one JPG/PNG floor plan;
2. one floor;
3. straight walls;
4. doors and windows;
5. either a trustworthy scale anchor or an explicitly estimated scale;
6. import into the existing editor;
7. manual correction and furniture placement;
8. first-person walkthrough.

Not v1: BIM/Revit, structural analysis, photorealistic rendering, automatic interior-design recommendations, or hidden cloud dependencies.

## Draft format

A reconstruction agent should output `plan2world-draft-v1`, for example:

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

See the full [draft specification](docs/plan2world-draft-v1.md).

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

## Working with Codex or another vision-capable agent

Open this repository as the working directory and give the agent the source floor-plan image. `AGENTS.md` defines the architectural contract and v1 constraints.

A useful task is:

```text
Read AGENTS.md and docs/plan2world-draft-v1.md.
Inspect the attached floor-plan image.
Create a plan2world-draft-v1 JSON file using visible dimensions where available.
Do not invent precise measurements when the scale is unknown; record assumptions.
Validate references between walls, doors, and windows.
```

Then run Plan2World and use its existing JSON import action to open the generated draft. The importer validates the draft, fills editable defaults, converts it into the existing project model, and runs the existing room detector.

This keeps Codex, DeepSeek Harness, or another model interchangeable: the application contract is JSON, not a provider API.

## Upstream and license

Plan2World is forked from [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D) and keeps the upstream MIT license and copyright notice. The original editor remains the foundation for 2D editing, furniture placement, persistence, and Three.js walkthrough functionality.

This repository is licensed under the [MIT License](LICENSE). Third-party models/assets may have their own attribution or license requirements; retain the existing model-source records when redistributing them.

## Direction

The product test is simple: **can a normal person upload a flat apartment plan, correct any AI mistakes in a familiar editor, place a sofa and bed, press Tab, and walk through the home?**

If that loop works reliably, more sophisticated model integrations can remain plugins rather than becoming architectural dependencies.