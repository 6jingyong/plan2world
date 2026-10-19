import { PLAN2WORLD_COMPONENT_TYPES, PLAN2WORLD_COMPONENT_GUIDE } from './componentVocabulary';
import { PLAN2WORLD_FURNITURE_TYPES, PLAN2WORLD_FURNITURE_VOCABULARY } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = "plan2world-white-model-instructions-v9" as const;

export interface ReconstructionOptions { scaleHint?: string }

export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object. Do not wrap it in markdown and do not include commentary outside JSON.

Work in this order:
1. Establish original raster dimensions and one source-pixel coordinate system (top-left origin, x right, y down). Keep the original image unchanged; map every crop back to it.
2. Trace the outer wall centreline outline first in original pixels, with no thickness. Preserve recesses, diagonals, curves and bay-window projections; do not use a bounding box or convex hull. Distinguish physical wall/glazing hosts from dimensions, text, open balcony edges and equipment ledges. Keep real hosts continuous across openings for stage 6. This architectural context identifies bay windows, ledges, wall piers and planter platforms before furniture recognition; do not turn them into furniture. Keep stable wall IDs for reuse.
3. Make a separate architectural-component recognition pass before furniture using only these fixed types: ${PLAN2WORLD_COMPONENT_TYPES.join(', ')}. Record visible evidence, normalized source location and floor identity internally. Components assign ownership, not extra meshes: reference existing walls, hosted windows or explicit floorAreas once as appropriate; never create a furniture block or a second solid for them. Finalize references after stage 6. Distinguish wall piers from separate columns, railings from full-height walls, shafts/voids/equipment ledges from living floor, and true fixed planters from loose plants. For stairs, distinguish tread/up-down evidence from a compass, rug, lift or door arc. Never infer an unseen destination floor, rise, ceiling hole or alignment of separate floor drawings. Record unmapped/unmodeled component type and source location in assumptions. Current draft conversion does not import native stairs/columns or subtract floor voids; do not present recognized geometry as a complete walkable multi-floor home.
4. Establish each candidate as a separate real furniture item, appliance or sanitary fixture from a recognizable symbol or label, then choose an exact sourceCategory from the fixed vocabulary below. Both checks are required: a permitted word does not establish object presence. Exclude architectural bays/ledges/platforms, walls, columns and floor patterns. Built-in cabinets require recognizable cabinet evidence. Visible balcony furniture remains eligible outside the outer wall line. If presence or a supported type cannot be established, omit it from furniture and record its region/reason in assumptions for later vocabulary review. Do not emit unknown/other or invent/translate IDs. Inventory stable IDs and approximate pixel centres; scan the whole plan, then regions once for omissions/duplicates, with at most one targeted pass. Keep the original; erasure is optional and must preserve architectural evidence. Do not estimate furniture dimensions/direction; users refine size, rotation, placement and style later.
5. Complete all interior walls using the outer trace. Keep one zero-width centreline per physical wall, including native curves; do not duplicate shared walls or trace both faces. Keep cabinet edges and swing arcs separate. Join corners/T-junctions at shared coordinates and split/reuse existing wall IDs consistently. Check source-supported enclosed boundaries before physical properties. Fix tracing/rounding gaps only where supported. Preserve open living/dining circulation, passages, balconies and voids. Never add a partition to close a furniture group or match a room label; disclose obscured connections. Closure checks the wall network; it does not create authored room polygons or prove source accuracy.
6. Extract hosted doors/windows on the completed walls, including sliding, concealed and shower access. Double tracks alone do not establish fixed glass; consider panel/access evidence. Never invent or widen openings for navigation. Preserve each continuous host; the converter creates apertures.
7. Apply one uniform source-to-cm transform to all layers, then assign physical properties or leave optional thickness/height to editable defaults. Never export zero thickness or move centrelines to make thickened faces meet. Output the existing furniture/walls/doors/windows arrays, not a second outline/room representation.

Required contract:
- schemaVersion must be "plan2world-draft-v1".
- units must be "cm".
- presentation must be "semantic-white-model".
- furnitureVocabulary must be "${PLAN2WORLD_FURNITURE_VOCABULARY}".
- Allowed sourceCategory IDs (exact, no free-form values): ${PLAN2WORLD_FURNITURE_TYPES.join(', ')}.
- Use exactly one supplied floor for this application version. If the image contains multiple levels, disclose that limitation; do not flatten them into one floor or invent vertical connections.

Object coverage check:
- During the existing regional scan, keep an internal ledger of original-pixel region bounds, object inventory IDs and readable object-related labels/abbreviations with source locations. Match each such label to an object ID or an explicit exclusion reason: architecture, room-use label, unsupported type or uncertain evidence. A room name does not establish furniture presence. Scan unlabeled symbols too; architectural classification must not silently discard real built-in storage. Do not add another full-image pass just for the ledger.
- Before emitting the complete JSON, reconcile the ledger/inventory with the serialized furniture IDs so accepted objects are not lost on export. Disclose unresolved labels/regions in existing assumptions. The ledger is internal working evidence, not another application scene or required root field.

Architectural component handling:
${PLAN2WORLD_COMPONENT_GUIDE}

Remaining contract:
- x increases to the right of the image; y increases downward.
- Walls are centreline paths. A normal wall uses straight start/end points. A visibly curved wall may additionally use one quadratic Bezier control point named curvePoint.
- Prefer one wall per continuous straight run or smooth quadratic arc. Do NOT approximate a simple visible curve with many tiny straight facets when one curvePoint describes it well. Split the wall only when curvature genuinely changes or a junction requires it.
- curvePoint is a plan-space control point in centimetres, in the same coordinate system as start/end. Omit it for straight walls; never invent curvature just to smooth noisy raster lines.
- Doors and windows MUST reference an existing wall id. Their position is a number from 0 to 1 measured from the wall start toward its end. For a curved wall, position follows the quadratic wall parameter from start to end.
- Keep IDs short and unique, for example w1, w2, d1, win1.
- Do not output rooms. Plan2World derives enclosed rooms from wall geometry. For clearly visible open outdoor ground (balconies, terraces or exterior access passages), optional floorAreas define ground only: each has id, name, confidence, and an ordered boundary. A boundary part is either {wallId, reverse?} for an entire existing live wall path, or {point:{x,y}, curvePoint?:{x,y}} for an open edge to the next part. Wall parts traverse start to end unless reverse=true. Parts connect and close automatically. A point control describes a quadratic edge to the next part's first point. Use wall references on shared sides rather than copying wall vertices. Do not overlap an existing enclosed room or turn railings/dashed limits into walls. Omit uncertain outlines and disclose the gap. Do not infer a floor merely from a bounding rectangle.
- Output clearly visible furniture and fixtures with id, catalogId="imported_object", an exact sourceCategory from the fixed vocabulary and approximate centre position in cm. Omit width/depth/height and rotation; the existing program supplies an editable 50 cm placeholder cube and zero rotation. These defaults are not source measurements. Optional explicit values remain compatible with existing drafts or user input. Do not choose a catalog style, brand or detailed model. If presence or a supported category is unclear, omit the object and disclose the vocabulary/evidence gap in assumptions. Never turn furniture/cabinet outlines into architectural partitions.
- For exterior walls, kind="exterior"; interior partitions use kind="interior". If unclear, use "unknown".
- Typical editable defaults are wall height 280 cm, interior wall thickness 12 cm, exterior wall thickness 20 cm, door height 210 cm, windows default to floor-to-ceiling fixed glass under this presentation; omit window height, sillHeight and type unless explicitly specified by the user. Record this presentation assumption. Furniture size/direction are editable display defaults, not source measurements; state this in assumptions. Omit unsupported optional architectural values rather than pretending they were measured.
- confidence values, when present, must be between 0 and 1.
- The plan must form connected geometry wherever the drawing visibly connects. Intersections and T-junctions should share coordinates.
- Avoid duplicate or nearly duplicate walls.
- Preserve the source plan's relative geometry even when absolute scale is uncertain.
- Trace wall centres in original source pixels first, then use one uniform cm-per-pixel scale and translation for every point, opening width and furniture centre. Avoid independently guessing world coordinates and image anchors.

Scale rules:
1. First look for printed dimensions, scale bars, grid dimensions, or clearly labelled lengths.
2. If a trustworthy dimension exists, set scale.mode="measured", explain it in scale.basis, and use it to calibrate all coordinates.
3. If the user supplied a known real-world length below, use scale.mode="provided" when the hint is sufficiently explicit.
4. A bare drawing ratio such as "1:100" is NOT enough to calibrate an arbitrary raster image unless the image also preserves a known physical page size/DPI or contains a usable scale bar. Do not treat the ratio alone as a real-world length.
5. Otherwise estimate from architectural conventions, preferably a clearly drawn ordinary door around 80–90 cm wide. Set scale.mode="estimated", lower scale.confidence, and state the assumption.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Source-image registration:
- Also return sourceRegistration when you can identify at least two reliable correspondences between the source raster and reconstructed wall endpoints.
- sourceRegistration.floorId must identify the reconstructed floor.
- Each anchor MUST point to an existing reconstructed wall endpoint using wallId + endpoint ("start" or "end").
- anchor.image is the matching point in the ORIGINAL SOURCE IMAGE, normalized from 0 to 1 with (0,0) at the top-left and (1,1) at the bottom-right.
- Prefer exact visible wall-centreline corners or T-junctions. Do not use text labels, dimension-arrow endpoints, furniture, or page corners.
- Spread anchors across the plan. Use 3–6 anchors when reliable; 2 is the minimum. Avoid clustered anchors.
- sourceRegistration.confidence describes confidence in image-to-wall correspondence, not architectural scale.
- If fewer than two correspondences are reliable, omit sourceRegistration entirely. Do not invent anchors.

Openings:
- A door/window must sit on the wall it visually interrupts.
- Estimate opening width only when not labelled; lower confidence accordingly.
- Infer swing direction only when the swing arc is clear; otherwise use a conservative single door and default orientation.

The following field guide has two closed spaces sharing w5 once. Replace all example geometry, scale and anchors using the source; it is not a source template.
The JSON object must have this shape:
{
  "schemaVersion": "plan2world-draft-v1",
  "presentation": "semantic-white-model",
  "furnitureVocabulary": "${PLAN2WORLD_FURNITURE_VOCABULARY}",
  "name": "...",
  "units": "cm",
  "scale": { "mode": "estimated", "confidence": 0.0, "basis": "..." },
  "assumptions": ["..."],
  "sourceRegistration": {
    "floorId": "floor-0",
    "confidence": 0.85,
    "anchors": [
      { "wallId": "w1", "endpoint": "start", "image": { "x": 0.12, "y": 0.18 } },
      { "wallId": "w1", "endpoint": "end", "image": { "x": 0.82, "y": 0.18 } }
    ]
  },
  "floors": [{
    "id": "floor-0",
    "name": "Ground Floor",
    "level": 0,
    "walls": [{
      "id": "w1",
      "start": { "x": 0, "y": 0 },
      "end": { "x": 400, "y": 0 },
      "thickness": 20,
      "height": 280,
      "kind": "exterior",
      "confidence": 0.95
    },
      { "id": "w2", "start": { "x": 400, "y": 0 }, "end": { "x": 400, "y": 300 }, "kind": "exterior" },
      { "id": "w3", "start": { "x": 400, "y": 300 }, "end": { "x": 0, "y": 300 }, "kind": "exterior" },
      { "id": "w4", "start": { "x": 0, "y": 300 }, "end": { "x": 0, "y": 0 }, "kind": "exterior" },
      { "id": "w5", "start": { "x": 200, "y": 0 }, "end": { "x": 200, "y": 300 }, "kind": "interior" }
    ],
    "doors": [{
      "id": "d1",
      "wallId": "w1",
      "position": 0.25,
      "width": 90,
      "height": 210,
      "type": "single",
      "swingDirection": "left",
      "flipSide": false,
      "confidence": 0.8
    }, { "id": "d2", "wallId": "w5", "position": 0.5, "width": 90 }],
    "windows": [],
    "furniture": [{ "id": "f1", "catalogId": "imported_object", "sourceCategory": "sofa", "position": { "x": 100, "y": 200 }, "confidence": 0.7 }]
  }]
}

Before answering, internally check that every opening references a wall that exists, that sourceRegistration anchors reference endpoints that exist, and that wall endpoints form the same connected topology shown in the source image.`;
}
