import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { PLAN2WORLD_FURNITURE_TYPES, PLAN2WORLD_FURNITURE_VOCABULARY } from '$lib/plan2world/furnitureVocabulary';
import { buildReconstructionInstructions } from '$lib/plan2world/reconstructionInstructions';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';

function draft(category = 'chair'): any {
  return { schemaVersion:'plan2world-draft-v1', furnitureVocabulary:'plan2world-furniture-v1', name:'Fixed semantics', units:'cm',
    scale:{mode:'estimated',confidence:.6}, floors:[{id:'floor',name:'Ground',level:0,
      walls:[{id:'w',start:{x:0,y:0},end:{x:400,y:0}}],
      furniture:[{id:'object',catalogId:'imported_object',sourceCategory:category,position:{x:120,y:200}}]}] };
}

describe('fixed reconstruction furniture vocabulary', () => {
  it.each(PLAN2WORLD_FURNITURE_TYPES)('accepts %s without choosing a style or estimating dimensions', category => {
    const input=draft(category), before=JSON.stringify(input);
    const parsed=parsePlan2WorldDraft(input,{requireFurnitureVocabulary:true});
    const calibrated=calibratePlan2WorldDraft(parsed,100,200);
    expect(calibrated.furnitureVocabulary).toBe(PLAN2WORLD_FURNITURE_VOCABULARY);
    expect(draftToProject(calibrated).floors[0].furniture[0]).toMatchObject({
      id:'object',catalogId:'imported_object',sourceCategory:category,position:{x:240,y:400},renderStyle:'block',rotation:0,
    });
    expect(parsed.floors[0].furniture![0].width).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(['bay_window','window_ledge','wall','door','unknown','other','unknown_fixture','magic_sofa','沙发'])('rejects an unlisted extraction type: %s', category => {
    expect(()=>parsePlan2WorldDraft(draft(category))).toThrow('not in plan2world-furniture-v1');
  });

  it('uses the vocabulary declaration itself as the semantic contract', () => {
    const input=draft('沙发'); delete input.furnitureVocabulary;
    expect(parsePlan2WorldDraft(input).floors[0].furniture![0].sourceCategory).toBe('沙发');
    expect(()=>parsePlan2WorldDraft(input,{requireFurnitureVocabulary:true})).toThrow('requires furnitureVocabulary');
    input.furnitureVocabulary='invented-v99';
    expect(()=>parsePlan2WorldDraft(input)).toThrow('furnitureVocabulary');
    input.furnitureVocabulary=PLAN2WORLD_FURNITURE_VOCABULARY;
    input.floors[0].furniture[0].catalogId='sofa';
    expect(()=>parsePlan2WorldDraft(input)).toThrow('requires imported_object and sourceCategory');
  });

  it('keeps the portable Skill list, runtime, JSON schema and evidence instructions in sync', () => {
    const registry=JSON.parse(readFileSync('skills/reconstruct-plan2world/references/furniture-vocabulary.json','utf8'));
    const schema=JSON.parse(readFileSync('schemas/plan2world-draft-v1.schema.json','utf8'));
    expect(registry.version).toBe(PLAN2WORLD_FURNITURE_VOCABULARY);
    expect(new Set(PLAN2WORLD_FURNITURE_TYPES).size).toBe(PLAN2WORLD_FURNITURE_TYPES.length);
    expect(schema.properties.furnitureVocabulary.const).toBe(PLAN2WORLD_FURNITURE_VOCABULARY);
    expect(schema.$defs.fixedFurnitureType.enum).toEqual(PLAN2WORLD_FURNITURE_TYPES);
    expect(schema.properties.presentation).toBeUndefined();

    const instructions=buildReconstructionInstructions();
    const line=instructions.split('\n').find(line=>line.startsWith('- Allowed sourceCategory IDs'))!;
    expect(line.slice(line.indexOf(': ')+2,-1).split(', ')).toEqual(PLAN2WORLD_FURNITURE_TYPES);
    expect(instructions).toContain('"schemaVersion":"source-furnishing-v1"');
    expect(instructions).toContain('Report only exact sourceCategory and approximate source-pixel centre.');
    expect(instructions).toContain('catalogId, furniture size or rotation');
    expect(instructions).not.toContain('"furnitureVocabulary"');
  });
});
