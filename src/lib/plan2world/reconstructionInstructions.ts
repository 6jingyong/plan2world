import { PLAN2WORLD_COMPONENT_TYPES, PLAN2WORLD_COMPONENT_GUIDE } from './componentVocabulary';
import { PLAN2WORLD_FURNITURE_TYPES, PLAN2WORLD_FURNITURE_VOCABULARY } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = "plan2world-white-model-instructions-v14" as const;

export interface ReconstructionOptions { scaleHint?: string }

export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object.

Use this internal order even though the final response is one draft:
1. Trace source-pixel wall centrelines only (conceptually source-wall-trace-v1).
2. Normalize intersections/T-junctions and small endpoint residuals into one Bare House (conceptually bare-house-v1). Never invent a connector across unsupported source space.
3. Verify the Bare House wall overlay against the unchanged source. This is the geometry hard gate.
4. Annotate doors/windows on normalized hosts. Opening uncertainty is a review warning unless it proves the host wall itself is wrong.
5. Add optional components and furniture only after the empty house exists.
6. Apply one uniform cm-per-pixel transform and emit plan2world-draft-v1.

Bare House rules:
- Walls are zero-width centreline paths. Preserve recesses, diagonals, T-junctions and visible quadratic curves via curvePoint.
- A raw long wall may span several rooms; deterministic normalization may split it at real source-supported junctions.
- A door/window interruption never breaks its logical host wall.
- Room-use labels and furniture never create or close geometry.
- Hard geometry failure means a materially misplaced/missing/invented wall or a source-supported enclosure that still cannot close after normalization.
- Do not output authored room polygons; Plan2World derives rooms from normalized wall geometry.

Openings:
- Every emitted opening references an existing normalized wall and uses observed source endpoints to derive width/position.
- single = one hinged leaf; double = two hinged leaves sharing one aperture; sliding = evidenced sliding-panel/track access; opening = evidenced leafless passage.
- Fixed glazing remains a window. Full-side windows and full-side sliding doors are valid.
- Missing/uncertain opening extent or operation is a later review issue, not a reason to regenerate a correct Bare House.
- Current white-model windows default to editable floor-to-ceiling fixed glass when height/sill are omitted.

Furniture:
- Furniture comes after the Bare House. Establish a real object first, then use an exact sourceCategory.
- Allowed sourceCategory IDs: ${PLAN2WORLD_FURNITURE_TYPES.join(', ')}.
- Emit catalogId="imported_object" and approximate centre only; omit source-unknown size/rotation.

Architectural components:
- Allowed fixed component types: ${PLAN2WORLD_COMPONENT_TYPES.join(', ')}.
${PLAN2WORLD_COMPONENT_GUIDE}
- floor.components are optional source semantics. componentVocabulary="plan2world-components-v2" is required when components are present.
- Do not emit render, visible, sceneEffect, sceneSupport or requiresNativeSupport flags.
- A balcony semantic is optional evidence only and never changes geometry.

Source fidelity and scale:
- Inspect printed dimensions and scale bars first, but printed dimensions and dimension-chain subdivisions are scale/distance evidence only.
- Never use cumulative dimension-chain values as wall x/y coordinates.
- A bare drawing ratio is NOT enough without physical page size/DPI or a usable scale bar.
- Use one uniform cm-per-pixel transform for normalized walls, openings, furniture and components.
- Reproject final cm wall geometry onto the unchanged source with that same transform; a material/systematic wall mismatch is a hard A-wall failure.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Source registration:
- When reliable, return 3–6 spread-out anchors (2 minimum) referencing actual normalized wall endpoints in ORIGINAL-image coordinates.

Required contract:
- schemaVersion="plan2world-draft-v1"
- units="cm"
- presentation="semantic-white-model"
- furnitureVocabulary="${PLAN2WORLD_FURNITURE_VOCABULARY}"
- One floor for this application version.
- Door/window position is 0..1 along the host; width is positive physical cm.
- confidence values, when present, are 0..1.
- Connected normalized geometry shares coordinates; avoid duplicate/nearly duplicate walls.

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
}`;
}
