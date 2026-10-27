import architectureGuide from '../../../skills/reconstruct-plan2world/references/architecture-pass.md?raw';
import furnishingGuide from '../../../skills/reconstruct-plan2world/references/furnishing-pass.md?raw';
import recoveryGuide from '../../../skills/reconstruct-plan2world/references/recovery-pass.md?raw';
import type { SourceRecoveryRequest } from './sourceRecovery';
import { PLAN2WORLD_FURNITURE_TYPES } from './furnitureVocabulary';

export const PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION = 'plan2world-architecture-furnishing-instructions-v23' as const;
export interface ReconstructionOptions { scaleHint?: string }

/** The portable Skill is also the source for the browser's observation prompt. */
export function buildArchitectureInstructions(options: ReconstructionOptions = {}): string {
  return `Return ONLY one source-architecture-v1 JSON object for the original floor-plan image.
Observe functionalZones, walls, windows, doors, sliding doors and scale together; no furniture objects.
Include functionalZones in this same observation. Balconies also require closed logical boundaries, using source-supported glazing, railing or explicit logical air edges.
Do NOT emit IDs or numeric confidence values. Do NOT choose or emit a wallId.
Do not return plan2world-draft-v1. Programs own all matching and arithmetic.

${architectureGuide}

User scale hint: ${options.scaleHint?.trim() || 'none.'}`;
}

/** Furniture evidence cannot reconsider the already frozen architecture. */
export function buildReconstructionInstructions(): string {
  return `Return ONLY one source-furnishing-v1 JSON object.
The architectural observation below is frozen. Do not add or alter walls,
openings, scale or architectural decisions, even if you notice another concern.
Do NOT emit IDs or numeric confidence values. Do NOT choose or emit a wallId.

${furnishingGuide}

- Allowed sourceCategory IDs: ${PLAN2WORLD_FURNITURE_TYPES.join(', ')}.
- Report only exact sourceCategory and approximate source-pixel centre.
- Forbidden: catalogId, furniture size or rotation; walls, openings, scaleEvidence,
  floors, rooms, sourceRegistration or final draft fields.`;
}

/** Used only by an explicitly supplied one-shot reviewer, never a paid retry. */
export function buildSourceRecoveryInstructions(request: SourceRecoveryRequest): string {
  return `${recoveryGuide}\n\nLOCAL_SOURCE_REVIEW_REQUEST_JSON:\n${JSON.stringify(request)}`;
}
