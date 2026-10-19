import vocabulary from '../../../skills/reconstruct-plan2world/references/component-vocabulary.json';

export const PLAN2WORLD_COMPONENT_VOCABULARY = vocabulary.version;
export const PLAN2WORLD_COMPONENT_REVIEW_SCHEMA = vocabulary.reviewSchema;
export const PLAN2WORLD_COMPONENT_TYPES: readonly string[] = vocabulary.types.map(item => item.id);
export type Plan2WorldSceneEffect = 'evidence-only' | 'boundary-only' | 'room-policy' | 'solid' | 'void' | 'vertical-structure' | 'hosted-asset';
export type Plan2WorldSceneSupport = 'ignore' | 'existing-geometry' | 'unsupported';

export function isPlan2WorldComponentType(value: unknown): value is string {
  return typeof value === 'string' && PLAN2WORLD_COMPONENT_TYPES.includes(value);
}

export function getPlan2WorldComponentDefinition(type: string) {
  return vocabulary.types.find(item => item.id === type);
}

export function getPlan2WorldComponentScenePolicy(type: string): { effect: Plan2WorldSceneEffect; support: Plan2WorldSceneSupport } {
  const definition = getPlan2WorldComponentDefinition(type);
  if (!definition) throw new Error(`Unknown Plan2World component type: ${type}`);
  return { effect: definition.sceneEffect as Plan2WorldSceneEffect, support: definition.sceneSupport as Plan2WorldSceneSupport };
}

export const PLAN2WORLD_SOURCE_FIDELITY_GATE = [
  'Source fidelity gate: wall coordinates come from source-pixel centreline tracing.',
  'Printed dimensions and dimension-chain subdivisions are scale or distance evidence only; never use cumulative dimension-chain values as wall x/y coordinates.',
  'Before accepting reconstruction, reproject final cm wall geometry onto the unchanged source with the same uniform transform and compare whole-plan alignment.',
  'An obvious or systematic mismatch is an A-layer failure: stop, preserve the failed candidate, fix the reusable reconstruction instructions and generate a fresh candidate from the original source; never fit registration to hide drift or continue downstream.',
].join(' ');

export const PLAN2WORLD_COMPONENT_CONTRACT = [
  `Emit root componentVocabulary="${PLAN2WORLD_COMPONENT_VOCABULARY}" whenever floor.components is non-empty.`,
  'Each recognized architectural component belongs in floor.components with id, fixed type, approximate cm position, optional confidence and geometryRefs to existing same-floor wall/door/window/floorArea IDs.',
  'Do not emit render, visible, sceneEffect, sceneSupport or requiresNativeSupport flags. Scene behavior is determined only by the fixed component registry after parsing.',
  'The source-review sidecar records only source evidence for the same component IDs; it does not own type, floor, geometry references or scene behavior.',
].join(' ');

export const PLAN2WORLD_COMPONENT_GUIDE = `${PLAN2WORLD_SOURCE_FIDELITY_GATE}\n${PLAN2WORLD_COMPONENT_CONTRACT}\n${vocabulary.types.map(item => `${item.id}: ${item.handling}`).join('\n')}`;
