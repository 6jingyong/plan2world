import vocabulary from '../../../skills/reconstruct-plan2world/references/component-vocabulary.json';

export const PLAN2WORLD_COMPONENT_VOCABULARY = 'plan2world-components-v2' as const;
if (vocabulary.version !== PLAN2WORLD_COMPONENT_VOCABULARY) {
  throw new Error('Plan2World component registry version mismatch');
}

export const PLAN2WORLD_COMPONENT_TYPES: readonly string[] = vocabulary.types.map(item => item.id);
export function isPlan2WorldComponentType(value: unknown): value is string {
  return typeof value === 'string' && PLAN2WORLD_COMPONENT_TYPES.includes(value);
}

