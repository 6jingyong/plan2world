import { PLAN2WORLD_FURNITURE_TYPES } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = 'plan2world-source-annotation-instructions-v18' as const;

export interface ReconstructionOptions { scaleHint?: string }

/** Second Vision pass: source evidence only; programs own IDs, confidence and math. */
export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are performing the SECOND visual pass for one floor-plan image.
Return ONLY one source-annotation-v1 JSON object. Do not return plan2world-draft-v1.

A deterministic program already normalized the wall trace into the Bare House supplied below.
Do not retrace, split, snap, close, move, scale or classify walls. Bare House geometry is context only.
The program assigns IDs, associates openings to hosts, converts units and builds the final draft.

Output shape:
{
  "schemaVersion":"source-annotation-v1",
  "scaleEvidence":{
    "kind":"measured_dimension|scale_bar|provided_length|estimated_reference",
    "realLengthCm":360,
    "endpoints":[{"x":100,"y":200},{"x":500,"y":200}],
    "evidence":"visible 360 cm dimension"
  },
  "openings":[{
    "kind":"door|window",
    "endpoints":[{"x":200,"y":300},{"x":260,"y":300}],
    "evidence":"visible jamb/glazing endpoints",
    "doorType":"single|double|sliding|opening",
    "typeEvidence":"visible operation evidence"
  }],
  "furniture":[{
    "sourceCategory":"sofa",
    "position":{"x":420,"y":510}
  }],
  "assumptions":[]
}

All points stay in ORIGINAL SOURCE IMAGE PIXELS (top-left origin, x right, y down).
Do NOT emit IDs or numeric confidence values; deterministic code owns them.

Scale evidence:
- measured_dimension = a trustworthy visible printed dimension;
- scale_bar = a usable visible scale bar;
- provided_length = an explicit user-supplied real length tied to these source endpoints;
- estimated_reference = a clearly identified ordinary architectural feature used only when no stronger evidence exists.
- Printed dimension-chain values are evidence only; never convert them into wall coordinates.
- A bare drawing ratio is insufficient without physical page size/DPI or a usable scale bar.
- State the real length and its two source-pixel endpoints; DO NOT calculate cmPerPixel, mode or confidence.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Openings:
- First establish that an opening exists, then report its two observed source endpoints.
- Do NOT choose or emit a wallId. The program resolves the Bare House host from those endpoints.
- doorType is optional and only evidence-backed: single, double, sliding, opening.
- Fixed glazing is kind="window". Full-side glazing/sliding access is valid.
- Do not invent an opening for circulation.

Furniture:
- Establish a separate real object first, then choose one exact sourceCategory.
- Allowed sourceCategory IDs: ${PLAN2WORLD_FURNITURE_TYPES.join(', ')}.
- Report only exact sourceCategory and approximate source-pixel centre.

FORBIDDEN derived/output fields:
- any id field;
- any confidence field;
- cmPerPixel, scale mode or final scale confidence;
- centimetre coordinates;
- opening wallId, width or position;
- wall kind/thickness/height or modified wall geometry;
- catalogId, furniture size or rotation;
- floors, rooms, sourceRegistration, components, meshes or final draft fields.

Programs will assign IDs and confidence policy, calculate scale, resolve opening hosts,
project endpoints, derive width/position, convert coordinates and validate the final draft.`;
}
