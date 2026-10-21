# Plan2World Draft v1

`plan2world-draft-v1` is the small, model-independent handoff between reconstruction and the existing editable Plan2World project model. It contains architectural geometry and evidence metadata; it does not contain editor state, derived rooms, rendering state or model reasoning.

## Coordinates and scale

- Units are centimetres.
- `x` increases rightward and `y` downward relative to the source image.
- Scale is `measured`, `provided` or `estimated`, with deterministic confidence and an optional basis.
- Optional `sourceRegistration` maps accepted draft wall endpoints back to normalized source-image coordinates. If supplied, it is strict contract data; invalid registration is an error, not a reason to bounds-fit the overlay.

## Geometry

Walls are zero-width centrelines. Straight walls use `start`/`end`; a visibly curved wall may add one quadratic `curvePoint`. Optional wall thickness/height are physical overrides; otherwise the native converter supplies editable defaults.

Doors and windows reference an existing wall by `wallId`, with `position` in `[0,1]` and positive `width`. Optional opening properties are explicit source/product choices. Initial reconstructed doors/windows default from floor to host wall height (280 cm when unspecified), with window sill 0 and standard window type. The assembler records these editable product defaults; they are not source measurements. Explicit saved opening heights and sills are preserved. No global presentation mode is required.

Optional `floorAreas` describe source-supported open ground such as a terrace edge that cannot be derived from a closed wall cycle. They must not be used to invent closure walls or duplicate detected rooms.

## Furniture

Current reconstruction declares:

```json
"furnitureVocabulary": "plan2world-furniture-v1"
```

When that declaration is present, every emitted furniture item must use `catalogId: "imported_object"`, an exact permitted `sourceCategory`, and a source-supported centre position. The fixed vocabulary lives in `skills/reconstruct-plan2world/references/furniture-vocabulary.json`.

The converter renders `imported_object` directly as a native editable block. Block rendering is a property of that catalog item, not a project-wide presentation mode. Optional dimensions and rotation are accepted when explicitly present; current image reconstruction normally leaves fine size/orientation to user editing.

Legacy/manual drafts without `furnitureVocabulary` may still carry ordinary catalog furniture hints. Strict current reconstruction enables `requireFurnitureVocabulary`.

## Minimal shape

```json
{
  "schemaVersion": "plan2world-draft-v1",
  "name": "Apartment",
  "units": "cm",
  "scale": { "mode": "measured", "confidence": 0.95 },
  "floors": [{
    "id": "floor-0",
    "name": "Ground Floor",
    "level": 0,
    "walls": [{ "id": "w1", "start": { "x": 0, "y": 0 }, "end": { "x": 500, "y": 0 } }]
  }]
}
```

Machine validation is defined by `schemas/plan2world-draft-v1.schema.json`. The deterministic parser is `src/lib/plan2world/draftContract.ts`; conversion is `src/lib/plan2world/draftConverter.ts`.

## Reconstruction ownership

The image model does not author this final structure directly in the active pipeline. It emits source-space wall evidence, then source-space semantic annotations. Deterministic programs assign IDs, normalize topology, resolve opening hosts, calculate scale/centimetres, attach source registration and assemble the final draft.

See `skills/reconstruct-plan2world/SKILL.md` for the active pipeline. Generated benchmark artifacts belong only in a new ignored `.plan2world-validation/runs/<run-id>/<sample-id>/` directory. Human benchmark references under `tests/evaluation/plan2world/source-references/` are post-hoc truth and must not be read before a fresh draft and source overlay are frozen.
