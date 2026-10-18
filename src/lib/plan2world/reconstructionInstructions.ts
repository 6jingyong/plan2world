export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = "plan2world-white-model-instructions-v6" as const;

export interface ReconstructionOptions { scaleHint?: string }

export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object. Do not wrap it in markdown and do not include commentary outside JSON.

Work in this order:
1. Establish original raster dimensions and one source-pixel coordinate system (top-left origin, x right, y down). Keep the original image unchanged; map every crop back to it.
2. Inventory visible furniture and fixtures with stable IDs, semantic type and approximate source-pixel centre. Do not estimate dimensions or direction for this extraction task; users adjust size, rotation and precise placement later in the editor/walkthrough. Scan the whole image, then review spatial regions once for missed items and deduplicate overlapping crops. Make at most one targeted correction pass for specific unresolved regions; disclose uncertainty rather than repeating full scans. Mark identified objects using an overlay/inventory; erasing them is optional and must not remove architectural evidence or replace the original source. Use unknown for a distinct visible object with unclear identity. Before assigning a specific type, require visible object evidence; a rectangular window ledge, bay or planter platform alone does not establish a cabinet. Lower confidence does not justify a guessed type: use unknown or omit a platform without separate object evidence and disclose it.
3. Trace a zero-width wall skeleton against the original image. Ignore thickness, height and styling. Use one shared centreline per physical wall, including visible curved paths; do not trace both wall faces or duplicate shared walls per room. Note door/window interruptions in real host walls, but preserve each host's continuous logical path. Keep furniture/cabinet outlines separate from walls.
4. Review closed spaces and circulation before adding physical properties. Follow each source-supported enclosed boundary and join corners/T-junctions at identical coordinates. Fix tracing/rounding gaps only where the source supports a connection. Preserve open-plan areas, passages, exterior voids and open balconies; never invent a partition just to close a box or match a room label. Disclose obscured/uncertain connections. Closure checks the wall network; it does not replace source-image review or create room polygons.
5. Sweep each wall for hosted doors/windows, including sliding, concealed and shower access. Double tracks alone do not establish a fixed window; consider panel marks and access context. Never invent or widen openings just to make navigation pass. Apply one uniform source-to-cm transform to all layers, then assign physical properties or leave optional thickness/height to editable normalization defaults. Never export zero thickness or shift centrelines to make thickened faces meet. Attach openings to existing wall IDs; the renderer creates apertures. Return only the final draft contract: its furniture/walls/doors/windows arrays are the layers, not a new skeleton/room representation.

Required contract:
- schemaVersion must be "plan2world-draft-v1".
- units must be "cm".
- presentation must be "semantic-white-model".
- Use exactly one floor for this first version.
- x increases to the right of the image; y increases downward.
- Walls are centreline paths. A normal wall uses straight start/end points. A visibly curved wall may additionally use one quadratic Bezier control point named curvePoint.
- Prefer one wall per continuous straight run or smooth quadratic arc. Do NOT approximate a simple visible curve with many tiny straight facets when one curvePoint describes it well. Split the wall only when curvature genuinely changes or a junction requires it.
- curvePoint is a plan-space control point in centimetres, in the same coordinate system as start/end. Omit it for straight walls; never invent curvature just to smooth noisy raster lines.
- Doors and windows MUST reference an existing wall id. Their position is a number from 0 to 1 measured from the wall start toward its end. For a curved wall, position follows the quadratic wall parameter from start to end.
- Keep IDs short and unique, for example w1, w2, d1, win1.
- Do not output rooms. Plan2World derives enclosed rooms from wall geometry. For clearly visible open outdoor ground (balconies, terraces or exterior access passages), optional floorAreas define ground only: each has id, name, confidence, and an ordered boundary. A boundary part is either {wallId, reverse?} for an entire existing live wall path, or {point:{x,y}, curvePoint?:{x,y}} for an open edge to the next part. Wall parts traverse start to end unless reverse=true. Parts connect and close automatically. A point control describes a quadratic edge to the next part's first point. Use wall references on shared sides rather than copying wall vertices. Do not overlap an existing enclosed room or turn railings/dashed limits into walls. Omit uncertain outlines and disclose the gap. Do not infer a floor merely from a bounding rectangle.
- Output clearly visible furniture and fixtures with id, catalogId="imported_object", a short sourceCategory such as bed/sofa/cabinet/toilet and approximate centre position in cm. Omit width/depth/height and rotation; the existing program supplies an editable 50 cm placeholder cube and zero rotation. These defaults are not source measurements. Optional explicit values remain compatible with existing drafts or user input. Do not choose a catalog style, brand or detailed model. Use unknown when identity is unclear. Never turn furniture/cabinet outlines into architectural partitions.
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
