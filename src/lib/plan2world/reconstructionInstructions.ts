import { PLAN2WORLD_FURNITURE_TYPES } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = 'plan2world-source-annotation-instructions-v16' as const;

export interface ReconstructionOptions { scaleHint?: string }

/**
 * Compatibility name: this now instructs the second Vision pass to emit source
 * evidence only. Deterministic code owns all geometry math and draft assembly.
 */
export function buildReconstructionInstructions(options: ReconstructionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();

  return `You are performing the SECOND visual pass for one floor-plan image.
Return ONLY one source-annotation-v1 JSON object. Do not return plan2world-draft-v1.

A deterministic program already normalized the wall trace into the Bare House supplied below.
Use its normalized wall IDs as references. Do not retrace, split, snap, close, move, scale or classify walls.

Output shape:
{
  "schemaVersion":"source-annotation-v1",
  "scaleEvidence":{
    "mode":"measured|provided|estimated",
    "realLengthCm":360,
    "endpoints":[{"x":100,"y":200},{"x":500,"y":200}],
    "confidence":0.9,
    "basis":"visible source evidence"
  },
  "openings":[{
    "id":"d1",
    "kind":"door|window",
    "wallId":"normalized-wall-id",
    "endpoints":[{"x":200,"y":300},{"x":260,"y":300}],
    "evidence":"visible jamb/glazing endpoints",
    "doorType":"single|double|sliding|opening",
    "typeEvidence":"visible operation evidence",
    "confidence":0.8
  }],
  "furniture":[{
    "id":"f1",
    "sourceCategory":"sofa",
    "position":{"x":420,"y":510},
    "confidence":0.8
  }],
  "assumptions":[]
}

All points stay in ORIGINAL SOURCE IMAGE PIXELS (top-left origin, x right, y down).

Scale evidence:
- Prefer a trustworthy printed dimension, scale bar or explicit user-supplied real length.
- Printed dimension-chain values are evidence only; never convert them into wall coordinates.
- A bare drawing ratio is insufficient without physical page size/DPI or a usable scale bar.
- If no measured/provided length exists, use one clearly identified ordinary architectural feature as estimated evidence and lower confidence.
- State the real length and its two source-pixel endpoints; DO NOT calculate cmPerPixel.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Openings:
- First establish that an opening exists, then report its two observed source endpoints.
- wallId MUST be an existing normalized Bare House wall ID supplied below.
- doorType is optional and only evidence-backed: single, double, sliding, opening.
- Fixed glazing is kind="window". Full-side glazing/sliding access is valid.
- Do not invent an opening for circulation.

Furniture:
- Establish a separate real object first, then choose one exact sourceCategory.
- Allowed sourceCategory IDs: ${PLAN2WORLD_FURNITURE_TYPES.join(', ')}.
- Report only stable id, exact sourceCategory, approximate source-pixel centre and optional confidence.

FORBIDDEN derived/output fields:
- cmPerPixel;
- centimetre coordinates;
- opening width or position;
- wall kind/thickness/height or modified wall geometry;
- catalogId, furniture size or rotation;
- floors, rooms, sourceRegistration, components, meshes or final draft fields.

Programs will calculate scale, opening projection/width/position, coordinate conversion, catalogId, validation and final draft assembly.`;
}
