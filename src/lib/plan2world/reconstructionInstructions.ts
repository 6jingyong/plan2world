import { PLAN2WORLD_COMPONENT_TYPES, PLAN2WORLD_COMPONENT_GUIDE } from './componentVocabulary';
import { PLAN2WORLD_FURNITURE_TYPES, PLAN2WORLD_FURNITURE_VOCABULARY } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = "plan2world-white-model-instructions-v12" as const;

export interface ReconstructionOptions { scaleHint?: string }

export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object. Do not wrap it in markdown and do not include commentary outside JSON.

Core order:
1. Establish the ORIGINAL raster coordinate system (top-left origin, x right, y down). Keep the source unchanged and map crops back to it.
2. Reconstruct the bare architectural shell BEFORE furniture or room-use semantics: trace all outer/interior wall centreline paths, shared junctions and source-supported closed spaces.
3. Sweep each closed-space boundary completely and classify its visible wall surface as solid, window or door intervals. Keep every logical host wall continuous even when an opening covers most or all of that side.
4. Extract doors/windows from observed source endpoints. Recognize evidenced sliding-panel/track systems as type=sliding, including wide or full-side sliding doors. Fixed glazing remains windows. A room may have several sides that are entirely windows and another side entirely a sliding door; no balcony/terrace classification is required.
5. Only after the empty house is structurally complete, recognize optional architectural semantics and then furniture/fixtures.
6. Apply one uniform cm-per-pixel transform, register to the unchanged source, and emit the frozen draft.

Wall tracing:
- Walls are zero-width centreline paths. Preserve recesses, diagonals and curves.
- Use one quadratic curvePoint for a simple visible quadratic curve; do not approximate it with many tiny straight facets.
- A door/window interruption never splits its logical host. Shared walls are emitted once.
- Room-use labels and furniture must never create or close geometry.
- Do not output authored rooms; Plan2World derives closed rooms from wall geometry.

Openings:
- A door/window must reference an existing wall and use observed source endpoints to derive width/position; never guess host percentages or repeated default widths.
- single = one evidenced hinged leaf; double = two evidenced hinged leaves sharing one full aperture; sliding = evidenced sliding access; opening = evidenced leafless passage.
- A multi-panel sliding assembly is one sliding aperture when its visible track/panel system forms one access opening. It may span the full logical wall side.
- Preserve solid piers. Do not silently call an unclassified remainder solid; sweep the whole side.
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
- Use one uniform cm-per-pixel transform for walls, curve controls, openings, furniture and component positions.
- Reproject final cm wall geometry onto the unchanged source using that same transform. An obvious/systematic mismatch is an A-layer failure; do not refit registration to hide it.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Source registration:
- When reliable, return sourceRegistration with 3–6 spread-out wall endpoint anchors (2 minimum), using normalized ORIGINAL-image coordinates.
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
- Connected source geometry must share coordinates; avoid duplicate/nearly duplicate walls.

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

Before answering, internally check that every opening references an existing wall, every sourceRegistration anchor references an existing endpoint, the wall topology matches the source, and the bare closed-room geometry is complete independently of furniture or semantic labels.`;
}
