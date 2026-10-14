# Plan2World Draft v1

`plan2world-draft-v1` is the model-independent interchange format between floor-plan understanding and the existing openPlan3D-derived editor.

The intent is deliberately narrow: an agent looks at an image and produces a small architectural draft; Plan2World validates it, fills safe defaults, and converts it into the editor's native `Project` model.

## Why a separate draft format?

The native project format contains editor state, room metadata, guides, annotations, groups, materials, package state, and other fields that an image-understanding model should not have to invent. The draft format contains only evidence-backed geometry and optional furniture hints.

## Coordinate system

- Unit: centimetres.
- `x` increases to the right of the source image.
- `y` increases downward relative to the source image.
- The origin may be any convenient point, normally the upper-left extent of the reconstructed plan.
- Geometry can later be translated without changing the building.

## Scale

A draft must state how scale was obtained:

- `measured`: derived from a visible dimension or other trustworthy source annotation.
- `provided`: explicitly supplied by the user.
- `estimated`: inferred from common architectural objects or proportions.

Estimated scale is allowed so that a rough 3D walkthrough can still be generated, but the UI should expose it as an assumption and let the user recalibrate.

## Walls

Walls are straight centreline segments in v1.

```json
{
  "id": "w1",
  "start": { "x": 0, "y": 0 },
  "end": { "x": 500, "y": 0 },
  "thickness": 20,
  "height": 280,
  "kind": "exterior",
  "confidence": 0.98
}
```

`thickness`, `height`, `kind`, and `confidence` are optional. The normalizer supplies editable defaults when dimensions are absent.

## Openings

Doors and windows reference a wall by ID and use a normalized position along that wall.

```json
{
  "id": "d1",
  "wallId": "w1",
  "position": 0.5,
  "width": 90,
  "height": 210,
  "type": "single"
}
```

`position = 0` is the wall start and `position = 1` is the wall end. Import validation must reject openings whose `wallId` does not exist.

## Furniture

Furniture is optional during reconstruction. If the source plan clearly contains furniture symbols, an agent may emit hints using catalog IDs. The user should remain free to delete or replace them.

```json
{
  "id": "f1",
  "catalogId": "sofa_3seat",
  "position": { "x": 320, "y": 260 },
  "rotation": 90,
  "confidence": 0.72
}
```

If no catalog mapping is trustworthy, omit furniture rather than inventing one.

## Uncertainty

Every element may include `confidence` in `[0, 1]`. A draft may also include free-text `assumptions`. These fields are for review and diagnostics; they must not alter geometry by themselves.

## Minimum valid draft

A useful v1 draft contains:

- `schemaVersion = "plan2world-draft-v1"`
- a project name;
- scale metadata;
- at least one floor;
- at least one wall.

See `schemas/plan2world-draft-v1.schema.json` for machine validation and `examples/plan2world-draft-v1.example.json` for a complete example.

## Conversion to the native editor model

The conversion layer should:

1. Validate schema and references.
2. Assign defaults only where the draft omits editable architectural properties.
3. Convert draft floors/walls/openings/furniture into the existing types in `src/lib/models/types.ts`.
4. Initialize editor-only arrays such as rooms, stairs, columns, guides, measurements, annotations, text annotations, and groups.
5. Run the existing room-detection path when possible rather than asking the vision model to reproduce editor-derived room state.
6. Preserve scale metadata and assumptions somewhere reviewable by the user.

The draft format should remain stable even if the editor's internal project model evolves.