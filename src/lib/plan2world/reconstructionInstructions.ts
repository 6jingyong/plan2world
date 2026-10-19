import { PLAN2WORLD_FURNITURE_TYPES, PLAN2WORLD_FURNITURE_VOCABULARY } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = "plan2world-white-model-instructions-v15" as const;

export interface ReconstructionOptions { scaleHint?: string }

export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object.

This is the annotation pass. A separate first pass already traced source walls and deterministic code normalized them into the Bare House supplied with this request. Do not run or simulate wall extraction again. Preserve the supplied wall topology and IDs. Convert its source-pixel coordinates to cm with one uniform scale, then annotate openings and optional furniture.\n\nBare House rules:
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

Do not emit floor.components or componentVocabulary. Architectural semantics without native geometry support are outside this reconstruction pass.\n\nSource fidelity and scale:
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
    "furniture":[{"id":"f1","catalogId":"imported_object","sourceCategory":"sofa","position":{"x":100,"y":200}}]
  }]
}`;
}
