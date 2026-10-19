import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PLAN2WORLD_COMPONENT_REVIEW_SCHEMA,
  PLAN2WORLD_COMPONENT_TYPES,
  PLAN2WORLD_COMPONENT_VOCABULARY,
  getPlan2WorldComponentScenePolicy,
} from '$lib/plan2world/componentVocabulary';

const registry = JSON.parse(readFileSync('skills/reconstruct-plan2world/references/component-vocabulary.json', 'utf8'));
const schema = JSON.parse(readFileSync('schemas/plan2world-draft-v1.schema.json', 'utf8'));

describe('Plan2World component vocabulary', () => {
  it('pins registry versions and keeps schema types synchronized', () => {
    expect(registry.version).toBe(PLAN2WORLD_COMPONENT_VOCABULARY);
    expect(registry.reviewSchema).toBe(PLAN2WORLD_COMPONENT_REVIEW_SCHEMA);
    expect(schema.$defs.fixedComponentType.enum).toEqual(PLAN2WORLD_COMPONENT_TYPES);
    expect(registry.types.map((item: any) => item.id)).toEqual(PLAN2WORLD_COMPONENT_TYPES);
  });

  it('requires deterministic scene policy for every component type', () => {
    const effects = ['evidence-only', 'boundary-only', 'room-policy', 'solid', 'void', 'vertical-structure', 'hosted-asset'];
    const support = ['ignore', 'existing-geometry', 'unsupported'];
    for (const item of registry.types) {
      expect(effects).toContain(item.sceneEffect);
      expect(support).toContain(item.sceneSupport);
      expect(getPlan2WorldComponentScenePolicy(item.id)).toEqual({ effect: item.sceneEffect, support: item.sceneSupport });
      expect(item).not.toHaveProperty('requiresNativeSupport');
    }
  });

  it('keeps intentional no-op and existing-geometry behavior explicit', () => {
    expect(getPlan2WorldComponentScenePolicy('shaft')).toEqual({ effect: 'boundary-only', support: 'existing-geometry' });
    expect(getPlan2WorldComponentScenePolicy('window_ledge')).toEqual({ effect: 'evidence-only', support: 'ignore' });
    expect(getPlan2WorldComponentScenePolicy('equipment_ledge')).toEqual({ effect: 'evidence-only', support: 'ignore' });
    expect(getPlan2WorldComponentScenePolicy('floor_void').support).toBe('unsupported');
  });
});
