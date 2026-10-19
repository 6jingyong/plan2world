import vocabulary from '../../../skills/reconstruct-plan2world/references/furniture-vocabulary.json';

/** Extraction semantics, independent of editable furniture models/styles. */
export const PLAN2WORLD_FURNITURE_VOCABULARY = 'plan2world-furniture-v1' as const;
export const PLAN2WORLD_FURNITURE_TYPES: readonly string[] = vocabulary.types.map(item => item.id);
const allowedTypes = new Set(PLAN2WORLD_FURNITURE_TYPES);

export function isPlan2WorldFurnitureType(value: string): boolean {
  return allowedTypes.has(value);
}
