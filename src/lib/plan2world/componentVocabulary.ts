import vocabulary from '../../../skills/reconstruct-plan2world/references/component-vocabulary.json';

export const PLAN2WORLD_COMPONENT_TYPES: readonly string[] = vocabulary.types.map(item => item.id);
export const PLAN2WORLD_COMPONENT_GUIDE = vocabulary.types.map(item => `${item.id}: ${item.handling}`).join('\n');
