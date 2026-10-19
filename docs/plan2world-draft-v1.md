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

## Reconstruction order

The provider-neutral Skill establishes one original-raster coordinate system,
then traces the actual outer wall centrelines, preserving bays and recesses.
Using that architectural context, it recognizes architectural components before
furniture, confirms real furniture/appliances/fixtures and chooses labels from the
fixed vocabulary. It then completes the shared interior wall network, checks
source-supported closure and open circulation, and extracts wall-hosted
doors/windows. One final uniform transform converts all layers to cm. Outer walls
are reused in the same network, not copied as a second outline. Furniture detection
checks object presence before choosing a type; a permitted cabinet label does not
make an architectural window ledge a cabinet.

This changes the reconstruction procedure, not the ordinary room representation.
Final walls remain centrelines with positive dimensions or omitted editable
defaults; doors/windows reference those walls. Plan2World still derives ordinary
rooms deterministically. Optional `floorAreas` describe source-supported open ground;
optional `floorOpenings` only mark a closed wall-derived room whose slab is absent.
No intermediate skeleton schema or authored ordinary room polygons are required.
The existing deterministic normalizer and renderer supply thickness, apertures and
meshes from the same native geometry.

## Walls

Walls are centreline paths. Straight walls use `start` and `end` only:

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

A visibly curved wall can add a single quadratic Bezier `curvePoint` in the same plan-space centimetre coordinates:

```json
{
  "id": "w2",
  "start": { "x": 0, "y": 0 },
  "end": { "x": 500, "y": 0 },
  "curvePoint": { "x": 250, "y": -140 },
  "kind": "exterior"
}
```

The curve is the quadratic Bezier from `start` to `end` controlled by `curvePoint`. Omit `curvePoint` for straight walls. Prefer one smooth quadratic wall over many short straight facets when the source clearly shows a simple arc; split a curve only when its shape genuinely changes or a junction requires another wall boundary.

`thickness`, `height`, `kind`, `curvePoint`, and `confidence` are optional. The normalizer supplies editable defaults when dimensions are absent.

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

`position = 0` is the wall start and `position = 1` is the wall end. For a curved wall, position follows the quadratic wall parameter from start to end; the editor converts that parameter to the curved path for physical opening width. Import validation must reject openings whose `wallId` does not exist.

Editor distances from A/B measure from the wall endpoint to the opening centre along the shared wall path. They use the same 16-span curved path as the 3D aperture geometry, rather than multiplying length by the Bezier parameter. Editing a distance converts it back to `position`; the saved contract remains parameter-based. Curved length readouts and resizing use this same metric.

## Open ground outlines

Optional `floor.floorAreas` describes source-visible ground that cannot be derived from an enclosed wall cycle, such as an open balcony, terrace or exterior access passage. Current reconstruction normally treats recognized balconies/terraces as independent enclosed glazed rooms under the explicit product policy; `floorAreas` remains available for source-explicit open ground and historical/manual drafts. Do not add walls to force a floor, infer a bounding rectangle, or duplicate an already detected room.

```json
{
  "id": "balcony", "name": "Balcony", "confidence": 0.8,
  "boundary": [
    { "wallId": "w3" },
    { "point": { "x": 0, "y": 600 } },
    { "point": { "x": 600, "y": 600 } }
  ]
}
```

Boundary parts are ordered. A wall reference follows its entire live centreline from start to end; `reverse: true` follows end to start. A free point optionally has a quadratic `curvePoint` controlling the edge to the next part's first point. Consecutive parts and the closing edge connect directly. Curves use the same 16 spans as native walls. See the [complete open balcony example](../examples/plan2world-open-balcony.example.json).

Use wall references wherever ground borders a real wall, preserving edits without copied wall vertices. Free points describe only a visible open edge. An uncertain or obscured extent should be omitted and disclosed in assumptions. Rings must have positive area, avoid self-intersection, and must not overlap an inferred room except at their shared edge. Partial overlaps are not automatically clipped.

Conversion retains each outline as a native `Room.boundary` with outdoor category and concrete finish. Shared floor analysis supplies the live area, 2D, slabs, 3D and walkthrough. It creates neither collision walls nor a ceiling. The room Properties panel edits free points/curves and wall references through existing history; there is no separate ground store. Native JSON and retained web project-package data preserve the boundary. Native companion rendering of this web extension is not qualified.

Reversing or splitting a referenced wall updates its directed references. Deleting a referenced wall retains the outline for repair, reports a geometry error and hides the invalid floor until corrected. Self-crossing/zero-area edits behave the same way. Deleting the open area leaves its source walls intact.

## Wall-backed floor openings

Optional `floor.floorOpenings` carries the narrow case where source evidence shows
that one closed wall-derived room is a slab void rather than walkable floor, such as
a positively recognized enclosed service shaft. It does not define a second room or
copy its polygon:

```json
{
  "id": "shaft-1",
  "name": "Service shaft",
  "wallIds": ["s1", "s2", "s3", "s4"],
  "confidence": 0.9
}
```

Each item requires a unique `id`, non-empty `name`, at least three unique same-floor
`wallIds`, and optional confidence in `[0,1]`. The unordered wall set must exactly
match one closed wall-derived room after deterministic room detection. Conversion
fails instead of guessing if it is a subset, does not close, or matches ambiguously.
A successful conversion reuses that detected native `Room`, assigns the authored
id/name, sets `floorOpening: true` and area 0. The existing floor, stacked-floor and
3D paths already omit slabs for that native semantic.

Do not infer `floorOpenings` from tiny area, absence of a visible door, proximity to
a bathroom/kitchen, or a service-like label without positive shaft/void evidence.
Do not add enclosure walls around a generic atrium solely to fit this contract.
Arbitrary non-wall-backed floor holes, stair apertures and multi-floor vertical
connections remain separate unsupported cases.

## Furniture

New reconstruction uses the optional root `presentation: "semantic-white-model"`. Each visible furniture/fixture requires `id`, `catalogId: "imported_object"`, an exact permitted `sourceCategory` and approximate centre `position`. Image extraction records semantics and broad location. Omit dimensions and rotation; users choose size, direction, precise placement and style later in the editor/walkthrough.

```json
{
  "id": "f1",
  "catalogId": "imported_object",
  "sourceCategory": "sofa",
  "position": { "x": 320, "y": 260 },
  "confidence": 0.72
}
```

The native editor retains category on the same `FurnitureItem`, rendering a labelled block with native `renderStyle: "block"`. Its existing imported-object defaults supply a 50 cm cube and rotation 0; these are editable display defaults, not source measurements. Optional positive `width`, `depth`, `height` and finite `rotation` remain supported, and explicit values win. Width is local x and depth is local y before rotation. Calibration scales position and any explicit footprint; omitted dimensions stay omitted, so display defaults are not scaled as source evidence.

SVG review shows a position marker when width/depth are absent, with no asserted physical footprint. Evaluate furniture extraction for omissions, duplicates, wrong types or wrong broad regions. Direction, size and fine placement are user edits. A legacy `sourceCategory` alone does not enable the block presentation. The user may select a local style in Properties; styling retains the native item's ID, category, placement and dimensions. Its optional `renderStyle: "model"` records that visual choice outside the AI draft contract. Do not infer a brand or detailed model from a plan symbol. For current extraction, omit unconfirmed/unlisted objects and record their source region/reason in `assumptions`; do not emit unknown/other or invented furniture labels.

Under this presentation, omitted window fields normalize to `sillHeight: 0`, `height: hostWall.height`, and `type: "fixed"`: floor-to-ceiling glass is a product default, not a claim about the building. Explicit fields win; an explicit sill with omitted height uses the remaining wall height.

Current Skill/AI output declares root `furnitureVocabulary: "plan2world-furniture-v1"`.
The portable [fixed vocabulary](../skills/reconstruct-plan2world/references/furniture-vocabulary.json)
contains furniture, appliance and sanitary-fixture IDs plus architectural exclusions.
The runtime and instruction builder read this registry; a regression check keeps
its IDs synchronized with the JSON schema. A versioned draft rejects unlisted IDs,
including architectural labels and unknown/other. Strict current reconstruction
also rejects a missing vocabulary declaration. The checker enables this with
`--require-furniture-vocabulary true`. Historical drafts without the field keep
their original labels and remain import-compatible. No saved candidate is migrated.
The enum validates labels, not visual object presence; source review remains required.

Drafts without this presentation retain legacy window defaults (90 cm sill, 120 cm height, standard type) and optional catalog furniture hints. Existing JSON remains compatible.

The provider-neutral reconstruction procedure and self-contained contract are in [the reconstruction Skill](../skills/reconstruct-plan2world/SKILL.md). Any visual model or human may produce this JSON. Provider transport remains outside the procedure and editor. To inspect a draft through the application's own parser and geometry pipeline:

```bash
NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft draft.json --source source.jpg --width 1536 --height 1026 --output inspection
```

Structural checks and accepted registration establish internal consistency; source-image overlays must still be reviewed for missed or invented geometry.

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
3. Convert draft floors/walls/openings/furniture and optional open floor areas into the existing types in `src/lib/models/types.ts`, preserving `curvePoint` for quadratic walls.
4. Run existing room detection, then map optional `floorOpenings` only when their wall set matches exactly one detected wall-derived room; mark that native room `floorOpening: true` rather than creating duplicate geometry.
5. Initialize editor-only arrays such as stairs, columns, guides, measurements, annotations, text annotations, and groups.
6. Preserve scale metadata and assumptions somewhere reviewable by the user.

The draft format should remain stable even if the editor's internal project model evolves.

### Saved evidence and live Review

Conversion retains optional native `Project.reconstruction` evidence, version `1`:
`scale`, `assumptions`, and per-floor wall/door/window plus optional open-floor and
floor-opening IDs with original confidence (and wall kind). It contains no geometry,
findings, provider configuration or credentials. Historical IDs may refer to deleted
objects; they do not recreate geometry or invalidate an otherwise editable project.

For image imports, the single native `Floor.backgroundImage` retains the raster and
its solved transform. Its optional `reconstructionSource` marker records pixel width,
height, filename and whether registration used anchors or the bounds fallback, plus
anchor confidence when available. The trace reads this saved transform rather than
fitting the image again after a wall correction. Moving the underlay keeps the marker;
replacing/removing its raster clears it, including when a native package returns.

The editor Review entry reuses the import Review presentation. Counts, polygons and
findings come from live native geometry; import scale/assumptions/confidence remain
historical evidence. JSON/local saves and retained `web.json` package data preserve
these fields. Old projects without evidence open normally; description text is not
parsed to invent missing evidence. Two-point draft scale calibration remains in the
initial image Review; this change does not rescale a furnished project when reopening it.
