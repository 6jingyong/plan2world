import {describe,it,expect} from 'vitest';
import {createDefaultProject} from '$lib/models/projectDefaults';
import {compileRuntimeArtifacts} from '$lib/runtime/runtimeArtifacts';
import {compileRuntimeScene} from '$lib/runtime/compileRuntimeScene';
import {applyNativeEditCommand} from '$lib/runtime/nativeEditing';

function project(){
 const p=createDefaultProject('Runtime safety'),f=p.floors[0];
 f.walls=[[0,0,600,0],[600,0,600,600],[600,600,0,600],[0,600,0,0]].map(([x,y,a,b],i)=>({id:`wall-${i}`,start:{x,y},end:{x:a,y:b},height:280,thickness:12,color:'#eeeeee'}));
 f.walkthroughStart={x:300,y:300};return p;
}
describe('runtime opening and semantic marker safety',()=>{
 it('retains a source semantic anchor without giving its arbitrary proxy walking collision',()=>{
  const p=project(),f=p.floors[0],base=compileRuntimeScene(p);
  f.furniture.push({id:'source-chair',catalogId:'imported_object',sourceCategory:'chair',renderStyle:'block',position:{x:200,y:200},rotation:0,scale:{x:1,y:1,z:1}});
  const marker=compileRuntimeScene(p);
  expect(marker.entities.find(e=>e.id==='source-chair')).toMatchObject({kind:'furniture',sourceCategory:'chair'});
  expect(marker.colliders).toEqual(base.colliders);
  const replaced=applyNativeEditCommand(p,{type:'replace',floorId:f.id,id:'source-chair',asset:{catalogId:'chair'}});
  expect(compileRuntimeScene(replaced.project).colliders.some(c=>c.ownerId==='source-chair')).toBe(true);
  expect(f.furniture[0].renderStyle).toBe('block');
 });
 it('keeps legacy unrecognized objects and real furniture physically collidable',()=>{
  const p=project(),f=p.floors[0];
  for(const [id,catalogId]of [['legacy','imported_object'],['real-chair','chair']])f.furniture.push({id,catalogId,position:{x:200,y:200},rotation:0,scale:{x:1,y:1,z:1},...(id==='real-chair'?{renderStyle:'block' as const}:{})});
  const scene=compileRuntimeScene(p);
  expect(scene.colliders.some(c=>c.ownerId==='legacy')).toBe(true);
  expect(scene.colliders.some(c=>c.ownerId==='real-chair')).toBe(true);
 });
 it('rejects a slightly oversized native opening before silently omitting its wall mesh',async()=>{
  const p=project(),f=p.floors[0];
  f.doors=[{id:'entry',wallId:'wall-0',position:.5,width:600,height:210,type:'single',swingDirection:'left',flipSide:false}];
  await expect(compileRuntimeArtifacts(p,async()=>null)).resolves.toBeDefined();
  f.doors[0].width=600.25;
  await expect(compileRuntimeArtifacts(p,async()=>null)).rejects.toThrow(/Cannot compile runtime opening "entry"/);
  expect(f.doors[0].width).toBe(600.25);
 });
 it('rejects overlapping windows without moving or deleting the original openings',async()=>{
  const p=project(),f=p.floors[0];
  f.windows=[.45,.5].map((position,i)=>({id:`window-${i}`,wallId:'wall-0',position,width:100,height:120,sillHeight:90,type:'standard'}));
  const before=structuredClone(f.windows);
  await expect(compileRuntimeArtifacts(p,async()=>null)).rejects.toThrow(/overlap/);
  expect(f.windows).toEqual(before);
 });
});
