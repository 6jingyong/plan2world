import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PLAN2WORLD_COMPONENT_TYPES } from '$lib/plan2world/componentVocabulary';
import { PLAN2WORLD_FURNITURE_TYPES } from '$lib/plan2world/furnitureVocabulary';

function draft(): any {
  return {componentVocabulary:'plan2world-components-v2',floors:[{
    id:'f0',walls:[{id:'w1'}],doors:[],windows:[{id:'win1'}],floorAreas:[],
    components:[
      {id:'c1',type:'bay_window',position:{x:40,y:20},geometryRefs:[{kind:'wall',id:'w1'},{kind:'window',id:'win1'}]},
      {id:'s1',type:'shaft',position:{x:20,y:20},geometryRefs:[{kind:'wall',id:'w1'}]},
      {id:'e1',type:'equipment_ledge',position:{x:10,y:10}},
      {id:'col1',type:'column',position:{x:30,y:30}},
    ],
  },{id:'f1',walls:[],doors:[],windows:[],floorAreas:[],components:[]}]};
}
function review(ids=['c1','s1','e1','col1']): any {
  return {schemaVersion:'plan2world-component-review-v2',vocabularyVersion:'plan2world-components-v2',components:ids.map((id,index)=>({
    id,image:{x:.2 + index*.1,y:.2},evidence:`Visible source evidence for ${id}`,
  }))};
}
function run(inputReview: unknown, inputDraft: unknown = draft()) {
  const dir=mkdtempSync(join(tmpdir(),'p2w-components-'));
  const text=JSON.stringify(inputReview),draftText=JSON.stringify(inputDraft);
  try {
    writeFileSync(join(dir,'review.json'),text);writeFileSync(join(dir,'draft.json'),draftText);
    const result=spawnSync('python3',['skills/reconstruct-plan2world/scripts/check-component-review.py','--review',join(dir,'review.json'),'--draft',join(dir,'draft.json')],{encoding:'utf8'});
    expect(readFileSync(join(dir,'review.json'),'utf8')).toBe(text);
    expect(readFileSync(join(dir,'draft.json'),'utf8')).toBe(draftText);
    return result;
  }finally{rmSync(dir,{recursive:true,force:true});}
}

describe('component evidence ownership',()=>{
  it('derives scene behavior only from the fixed registry',()=>{
    const result=run(review());expect(result.status).toBe(0);
    const report=JSON.parse(result.stdout);
    expect(report).toMatchObject({
      componentCount:4,
      unmappedComponents:[],
      ignoredSceneComponents:['e1'],
      unmodeledComponents:['col1'],
    });
    expect(report.scenePolicies).toEqual(expect.arrayContaining([
      {id:'s1',type:'shaft',sceneEffect:'boundary-only',sceneSupport:'existing-geometry'},
      {id:'e1',type:'equipment_ledge',sceneEffect:'evidence-only',sceneSupport:'ignore'},
    ]));
  });

  it('uses draft geometry ownership and keeps the review sidecar evidence-only',()=>{
    const d=draft();d.floors[0].components[0].geometryRefs=[{kind:'wall',id:'w1'}];
    expect(JSON.parse(run(review(),d).stdout).unmappedComponents).toEqual(['c1']);
    const r=review();r.components[0].type='shaft';
    expect(run(r,draft()).status).toBe(1);
  });

  it('keeps visible voids and unresolved stairs as deterministic gaps',()=>{
    const d=draft();
    d.floors[0].components=[
      {id:'v1',type:'floor_void',position:{x:20,y:40}},
      {id:'st1',type:'stair',position:{x:50,y:40},vertical:{direction:'up'}},
    ];
    const result=run(review(['v1','st1']),d);expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({unmodeledComponents:['v1','st1'],unresolvedStairTargets:['st1']});
    d.floors[0].components[1].vertical.toFloorId='f1';
    expect(JSON.parse(run(review(['v1','st1']),d).stdout).unresolvedStairTargets).toEqual([]);
  });

  it.each(['missing-evidence','extra-evidence','bad-point','absent-ref','policy-flag','wrong-vocabulary'])('rejects %s',failure=>{
    const d=draft(),r=review();
    if(failure==='missing-evidence')r.components.pop();
    if(failure==='extra-evidence')r.components.push({id:'ghost',image:{x:.1,y:.1},evidence:'ghost'});
    if(failure==='bad-point')r.components[0].image.x=1.1;
    if(failure==='absent-ref')d.floors[0].components[0].geometryRefs=[{kind:'wall',id:'missing'}];
    if(failure==='policy-flag')d.floors[0].components[0].sceneEffect='solid';
    if(failure==='wrong-vocabulary')d.componentVocabulary='plan2world-components-v1';
    expect(run(r,d).status).toBe(1);
  });

  it('keeps architectural IDs separate from furniture IDs',()=>{
    expect(PLAN2WORLD_COMPONENT_TYPES).toHaveLength(11);
    expect(PLAN2WORLD_COMPONENT_TYPES.filter(id=>PLAN2WORLD_FURNITURE_TYPES.includes(id))).toEqual([]);
  });
});
