import { PLAN2WORLD_COMPONENT_TYPES, PLAN2WORLD_COMPONENT_GUIDE } from './componentVocabulary';
import { PLAN2WORLD_FURNITURE_TYPES, PLAN2WORLD_FURNITURE_VOCABULARY } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = "plan2world-white-model-instructions-v13" as const;

export interface ReconstructionOptions { scaleHint?: string }

export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object. Do not wrap it in markdown and do not include commentary outside JSON.

Core order:
1. Establish the ORIGINAL raster coordinate system (top-left origin, x right, y down). Keep the source unchanged and map crops back to it.
2. Trace the bare raw wall-centreline skeleton BEFORE furniture, room-use semantics or openings. A long wall may span several rooms at this raw stage.
3. Deterministically normalize that wall graph before binding openings: existing line intersections and endpoint-on-wall T-junctions become graph nodes; long walls are split at those nodes; small endpoint residuals within tolerance may snap to the existing host. Never invent a connector across an unsupported gap.
4. The normalized wall graph is the actual architectural skeleton. Closed rooms are derived from it regardless of labels such as balcony/bedroom/study.
5. Attach doors/windows to normalized hosts. Treat opening location/extent/type uncertainty as a review issue unless it proves the wall geometry itself is wrong.
6. Only after the empty house wall frame is correct, recognize optional architectural semantics and then furniture/fixtures.
7. Apply one uniform cm-per-pixel transform, register to the unchanged source, and emit the frozen draft.

Wall tracing and topology:
- Walls are zero-width centreline paths. Preserve recesses, diagonals and curves.
- Use one quadratic curvePoint for a simple visible quadratic curve; do not approximate it with many tiny straight facets.
- A door/window interruption never splits its logical host. Shared walls are emitted once.
- Room-use labels and furniture must never create or close geometry.
- A T-junction does not require the image model to pre-split a long wall perfectly. If the traced lines already intersect, deterministic graph normalization should split the long wall there.
- Topology normalization may split/snap existing traced geometry only. It must never draw a new unsupported wall across a gap.
- Hard wall-frame failure means: visibly misplaced/missing/invented wall, or a supposed closed space that still cannot close after deterministic normalization.
- Do not output authored rooms; Plan2World derives closed rooms from normalized wall geometry.

Openings:
- A door/window must reference an existing normalized wall and use observed source endpoints to derive width/position; never guess host percentages or repeated default widths.
- single = one evidenced hinged leaf; double = two evidenced hinged leaves sharing one full aperture; sliding = evidenced sliding access; opening = evidenced leafless passage.
- A multi-panel sliding assembly is one sliding aperture when its visible track/panel system forms one access opening. It may span the full logical wall side.
- Fixed glazing remains windows. A room may have several sides that are entirely windows and another side entirely a sliding door; no balcony/terrace classification is required.
- Preserve solid piers.
- If a window/door position, width, operation or completeness is uncertain but the normalized wall frame is correct, retain it as a review warning for later 2D/3D/walkthrough adjustment rather than rejecting the wall skeleton.
- Promote an opening issue to a hard failure only when it demonstrates that the host wall geometry itself is wrong/disconnected.
- The current white-model presentation uses floor-to-ceiling fixed glass when window height/sill are omitted; this is a presentation default, not a source measurement.

Furniture:
- Furniture comes after the bare house. Establish a real object first, then use an exact sourceCategory from the fixed vocabulary.
- Allowed sourceCategory IDs: ${PLAN2WORLD_FURNITURE_TYPES.join(', ')}.
- Emit catalogId="imported_object" and approximate centre only; omit source-unknown size/rotation.
- Do not turn bays, ledges, walls, columns, planters or room outlines into furniture.

Architectural components:
- Allowed fixed component types: ${PLAN2WORLD_COMPONENT_TYPES.join(', ')}.
${PLAN2WORLD_COMPONENT_GUIDE}
- floor.components are optional source semantics. componentVocabulary="plan2world-components-v2" is required when components are present.
- Do not emit render, visible, sceneEffect, sceneSupport or requiresNativeSupport flags.
- A balcony/terrace semantic is optional evidence only; it never creates, closes or alters a room.

Source fidelity and scale:
- First inspect printed dimensions, scale bars and clearly labelled lengths.
- A bare drawing ratio is NOT enough to calibrate an arbitrary raster without physical page size/DPI or a usable scale bar.
- Printed dimensions and dimension-chain subdivisions are scale/distance evidence only; never use cumulative dimension-chain values as wall x/y coordinates.
- Use one uniform cm-per-pixel transform for normalized walls, curve controls, openings, furniture and component positions.
- Reproject final cm wall geometry onto the unchanged source using that same transform. An obvious/systematic wall mismatch is a hard A-wall failure; do not refit registration to hide it.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Source registration:
- When reliable, return sourceRegistration with 3–6 spread-out normalized wall endpoint anchors (2 minimum), using normalized ORIGINAL-image coordinates.
- Anchors must reference real reconstructed wall endpoints; never use text, dimensions, furniture or page corners.

Required contract:
- schemaVersion="plan2world-draft-v1"
- units="cm"
- presentation="semantic-white-model"
- furnitureVocabulary="${PLAN2WORLD_FURNITURE_VOCABULARY}"
- Use one supplied floor for this application version; disclose multi-level limitations instead of flattening levels.
- x increases rightward; y increases downward.
- Door/window position is 0..1 along the host; width is positive physical cm.
- Omit unsupported optional architectural values rather than pretending they were measured.
- confidence values, when present, are 0..1.
- Connected normalized source geometry must share coordinates; avoid duplicate/nearly duplicate walls.

Return JSON shaped like:
{
  "schemaVersion":"plan2world-draft-v1",
  "presentation":"semantic-white-model",
  "furnitureVocabulary":"${PLAN2WORLD_FURNITURE_VOCABULARY}",
  "componentVocabulary":"plan2world-components-v2",
  "name":"...",
  "units":"cm",
  "scale":{"mode":"estimated","confidence":0.5,"basis":"..."},
  "assumptions":["..."],
  "sourceRegistration":{"floorId":"floor-0","confidence":0.8,"anchors":[{"wallId":"w1","endpoint":"start","image":{"x":0.1,"y":0.1}},{"wallId":"w2","endpoint":"end","image":{"x":0.9,"y":0.9}}]},
  "floors":[{
    "id":"floor-0","name":"Ground Floor","level":0,
    "walls":[{"id":"w1","start":{"x":0,"y":0},"end":{"x":400,"y":0},"kind":"exterior"}],
    "doors":[{"id":"d1","wallId":"w1","position":0.5,"width":160,"type":"sliding"}],
    "windows":[],
    "furniture":[{"id":"f1","catalogId":"imported_object","sourceCategory":"sofa","position":{"x":100,"y":200}}],
    "components":[]
  }]
}

Before answering, internally check that the normalized wall topology matches the source independently of furniture/semantic labels. Opening uncertainty may remain for later review, but every emitted opening must reference an existing normalized wall.`;
}
