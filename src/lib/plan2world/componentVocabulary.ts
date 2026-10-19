import vocabulary from '../../../skills/reconstruct-plan2world/references/component-vocabulary.json';

export const PLAN2WORLD_COMPONENT_TYPES: readonly string[] = vocabulary.types.map(item => item.id);

export const PLAN2WORLD_SOURCE_FIDELITY_GATE = [
  'Source fidelity gate: wall coordinates come from source-pixel centreline tracing.',
  'Printed dimensions and dimension-chain subdivisions are scale or distance evidence only; never use cumulative dimension-chain values as wall x/y coordinates.',
  'Before accepting reconstruction, reproject final cm wall geometry onto the unchanged source with the same uniform transform and compare whole-plan alignment.',
  'An obvious or systematic mismatch is an A-layer failure: stop, preserve the failed candidate, fix the reusable reconstruction instructions and generate a fresh candidate from the original source; never fit registration to hide drift or continue downstream.',
].join(' ');

export const PLAN2WORLD_COMPONENT_GUIDE = `${PLAN2WORLD_SOURCE_FIDELITY_GATE}\n${vocabulary.types.map(item => `${item.id}: ${item.handling}`).join('\n')}`;
