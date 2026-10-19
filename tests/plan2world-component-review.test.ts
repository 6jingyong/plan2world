import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PLAN2WORLD_COMPONENT_TYPES } from '$lib/plan2world/componentVocabulary';
import { PLAN2WORLD_FURNITURE_TYPES } from '$lib/plan2world/furnitureVocabulary';

function review(): any {
  return {schemaVersion:'plan2world-component-review-v1',vocabularyVersion:'plan2world-components-v1',components:[{
    id:'c1',type:'bay_window',floorId:'f0',image:{x:.4,y:.2},evidence:'Projecting outer frame and glazing',
    geometryRefs:[{kind:'wall',id:'w1'},{kind:'window',id:'win1'}],
  }]};
}
const draft={floors:[{id:'f0',walls:[{id:'w1'}],windows:[{id:'win1'}]},{id:'f1',walls:[],windows:[]}]};
function run(input: unknown) {
  const dir=mkdtempSync(join(tmpdir(),'p2w-components-'));
  const text=JSON.stringify(input),draftText=JSON.stringify(draft);
  try {
    writeFileSync(join(dir,'review.json'),text);writeFileSync(join(dir,'draft.json'),draftText);
    const result=spawnSync('python3',['skills/reconstruct-plan2world/scripts/check-component-review.py','--review',join(dir,'review.json'),'--draft',join(dir,'draft.json')],{encoding:'utf8'});
    expect(readFileSync(join(dir,'review.json'),'utf8')).toBe(text);
    expect(readFileSync(join(dir,'draft.json'),'utf8')).toBe(draftText);
    return result;
  }finally{rmSync(dir,{recursive:true,force:true});}
}

describe('component evidence ownership',()=>{
  it('validates references without generating or altering geometry',()=>{
    const result=run(review());expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({componentCount:1,unmappedComponents:[],unmodeledComponents:[]});
  });
  it('keeps sealed shafts out of native gaps while visible voids and stairs remain explicit',()=>{
    const input=review();input.components[0].geometryRefs=[];
    input.components.push({id:'s1',type:'stair',floorId:'f0',image:{x:.2,y:.6},evidence:'Treads and UP label',vertical:{direction:'up'}});
    input.components.push({id:'v1',type:'floor_void',floorId:'f1',image:{x:.3,y:.6},evidence:'Explicit VOID annotation'});
    input.components.push({id:'sh1',type:'shaft',floorId:'f0',image:{x:.8,y:.3},evidence:'Sealed service shaft enclosure',geometryRefs:[{kind:'wall',id:'w1'}]});
    let result=run(input);expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({unmappedComponents:['c1'],unmodeledComponents:['s1','v1'],unresolvedStairTargets:['s1']});
    input.components[1].vertical.toFloorId='f1';result=run(input);
    expect(JSON.parse(result.stdout)).toMatchObject({unmodeledComponents:['s1','v1'],unresolvedStairTargets:[]});
  });
  it.each(['invented-type','missing-floor','bad-point','furniture-ref','duplicate-id','absent-target','same-floor-target','wrong-vertical-owner'])('rejects %s',failure=>{
    const input=review(),item=input.components[0];
    if(failure==='invented-type')item.type='magic_component';
    if(failure==='missing-floor')item.floorId='absent';
    if(failure==='bad-point')item.image.x=1.1;
    if(failure==='furniture-ref')item.geometryRefs=[{kind:'furniture',id:'w1'}];
    if(failure==='duplicate-id')input.components.push(structuredClone(item));
    if(failure==='absent-target'||failure==='same-floor-target'){item.type='stair';item.vertical={toFloorId:failure==='absent-target'?'absent':'f0'};}
    if(failure==='wrong-vertical-owner')item.vertical={direction:'up'};
    expect(run(input).status).toBe(1);
  });
  it('requires enclosing walls and windows for current balcony mappings',()=>{
    const input=review();input.components[0].type='balcony';
    expect(JSON.parse(run(input).stdout).unmappedComponents).toEqual([]);
    input.components[0].geometryRefs=[{kind:'wall',id:'w1'}];
    expect(JSON.parse(run(input).stdout).unmappedComponents).toEqual(['c1']);
    input.components[0].geometryRefs=[{kind:'window',id:'win1'}];
    expect(JSON.parse(run(input).stdout).unmappedComponents).toEqual(['c1']);
  });
  it('keeps fixed architectural IDs separate from furniture IDs',()=>{
    expect(PLAN2WORLD_COMPONENT_TYPES).toHaveLength(11);
    expect(PLAN2WORLD_COMPONENT_TYPES.filter(id=>PLAN2WORLD_FURNITURE_TYPES.includes(id))).toEqual([]);
  });
});
