import {describe,it,expect} from 'vitest';
import {createDefaultProject} from '$lib/models/projectDefaults';
import {compileRuntimeScene,compileDoorGeometry} from '$lib/runtime/compileRuntimeScene';
import {nativeArchitectureEditor,applyArchitectureEditCommand} from '$lib/runtime/architectureEditing';
import {reviewDoorGeometry} from '$lib/runtime/doorGeometryReview';
import type {Wall} from '$lib/models/types';

const wall=(id:string,x:number,y:number,a:number,b:number):Wall=>({id,start:{x,y},end:{x:a,y:b},thickness:12,height:280,color:'#ffffff'});
function project(){
 const p=createDefaultProject('Door review'),f=p.floors[0];
 f.walls=[wall('north',0,0,600,0),wall('east',600,0,600,600),wall('south',600,600,0,600),wall('west',0,600,0,0)];
 f.doors=[{id:'entry',wallId:'north',position:.5,width:90,height:210,type:'single',swingDirection:'left',flipSide:false}];
 return p;
}
const review=(p:ReturnType<typeof project>)=>nativeArchitectureEditor(p).floors[0].currentChecks;
describe('read-only current door/wall geometry findings',()=>{
 it('uses the same compiler primitives before enclosure without claiming a floor or player route',()=>{
  const p=project(),f=p.floors[0],runtime=compileRuntimeScene(p),geometry=compileDoorGeometry(f);
  expect(geometry.entities).toEqual(runtime.entities);
  expect(geometry.colliders).toEqual(runtime.colliders.filter(c=>c.kind==='box'&&c.purpose!=='perimeter'));
  f.rooms.push({id:'invalid-surface',name:'Unresolved',walls:[],area:0,floorTexture:'hardwood',boundary:[]});
  expect(()=>compileRuntimeScene(p)).toThrow();
  expect(reviewDoorGeometry(compileDoorGeometry(f)).status).toBe('checked');
 });
 it('locates actual closed-leaf intersections with an adjoining wall without changing native evidence or runtime',()=>{
  const p=project(),f=p.floors[0];f.walls.push(wall('junction',345,0,345,300));
  p.architectureReview={version:1,issues:[{id:'original-note',floorId:f.id,message:'Source uncertainty.',resolved:false}]};
  const before=JSON.stringify(p),runtime=compileRuntimeScene(p),result=review(p);
  expect(result.status).toBe('checked');expect(result.findings).toContainEqual(expect.objectContaining({openingId:'entry',code:'door-closed-overlap',position:{x:300,y:0},blockerIds:['junction']}));
  expect(JSON.stringify(p)).toBe(before);expect(compileRuntimeScene(p)).toEqual(runtime);
  expect(nativeArchitectureEditor(p).floors[0].issues).toEqual(p.architectureReview.issues);
 });
 it('distinguishes a sweep-only obstruction, using the prescribed swing and flip side',()=>{
  const p=project();p.floors[0].walls.push(wall('sweep',280,55,310,55));
  expect(review(p).findings).toContainEqual(expect.objectContaining({code:'door-motion-overlap',blockerIds:['sweep']}));
  expect(review(p).findings.some(f=>f.code==='door-closed-overlap')).toBe(false);
  p.floors[0].doors[0].flipSide=true;
  expect(review(p).findings).toEqual([]);
 });
 it('allows closed-face contact and identifies other doors independently of their presentation material',()=>{
  const p=project();p.floors[0].walls.push(wall('touching',351,0,351,100));
  expect(review(p).findings.some(f=>f.code==='door-closed-overlap')).toBe(false);
  const f=p.floors[0];f.walls.push(wall('cross-host',300,-100,300,100));
  f.doors.push({...f.doors[0],id:'other-door',wallId:'cross-host',material:'glass'});
  expect(review(p).findings.find(x=>x.openingId==='entry'&&x.code==='door-closed-overlap')?.blockerIds).toContain('other-door');
 });
 it('keeps leafless apertures leafless and ignores the explicit connected host for hinged motion',()=>{
  const p=project();expect(review(p).findings).toEqual([]);
  p.floors[0].doors[0].type='opening';p.floors[0].walls.push(wall('junction',345,0,345,300));
  const r=review(p);expect(r.status).toBe('checked');expect(r.findings).toEqual([]);
  expect(compileRuntimeScene(p).colliders.some(c=>c.ownerId==='entry')).toBe(false);
 });
 it('recomputes after deliberate opening correction while source review remains unchanged',()=>{
  const p=project(),f=p.floors[0];f.walls.push(wall('junction',345,0,345,300));
  p.architectureReview={version:1,sourceObservations:'Frozen source.',issues:[{id:'original-note',floorId:f.id,message:'Original source question.',resolved:false}]};
  expect(review(p).findings.length).toBeGreaterThan(0);
  const edited=applyArchitectureEditCommand(p,{type:'opening-update',floorId:f.id,id:'entry',wallId:'north',position:.35,width:70,height:210}).project;
  expect(review(edited).findings).toEqual([]);expect(edited.architectureReview).toEqual(p.architectureReview);
  expect(edited.floors[0].walls).toEqual(f.walls);expect(p.floors[0].doors[0].width).toBe(90);
  expect(edited).not.toHaveProperty('currentChecks');
 });
 it('supports rotated geometry and retains identical native coordinates',()=>{
  const p=project(),f=p.floors[0];f.walls.push(wall('junction',345,0,345,300));
  for(const w of f.walls)for(const key of ['start','end']as const){const {x,y}=w[key];w[key]={x:-y,y:x};}
  expect(review(p).findings).toContainEqual(expect.objectContaining({openingId:'entry',code:'door-closed-overlap',position:{x:0,y:300},blockerIds:['junction']}));
 });
 it('reports unsupported motion and uncompiled geometry as incomplete rather than certifying clearance',()=>{
  const p=project();p.floors[0].doors[0].type='bifold';expect(review(p).status).toBe('partial');expect(review(p).uncheckedDoorIds).toEqual(['entry']);
  p.floors[0].rooms.push({id:'invalid-floor',name:'Invalid floor',walls:[],area:0,floorTexture:'hardwood',boundary:[]});
  expect(review(p).status).toBe('unavailable');
 });
 it.each(['oversized','overlapping'])('does not certify %s apertures rejected by strict runtime geometry',kind=>{
  const p=project(),f=p.floors[0];
  if(kind==='oversized')f.doors[0].width=601;
  else f.doors.push({...f.doors[0],id:'overlapping-door'});
  expect(review(p).status).toBe('unavailable');
 });
 it('keeps unsupported-door status on its actual floor',()=>{
  const p=project(),upper=structuredClone(p.floors[0]);upper.id='upper';upper.level=1;
  for(const w of upper.walls)w.id+='-upper';
  upper.doors[0]={...upper.doors[0],id:'upper-door',wallId:'north-upper',type:'bifold'};
  p.floors.push(upper);
  const floors=nativeArchitectureEditor(p).floors;
  expect(floors[0].currentChecks.status).toBe('checked');expect(floors[0].currentChecks.uncheckedDoorIds).toEqual([]);
  expect(floors[1].currentChecks.status).toBe('partial');expect(floors[1].currentChecks.uncheckedDoorIds).toEqual(['upper-door']);
 });
 it('bounds pair evaluation and explicitly lists unchecked doors when the budget is exhausted',()=>{
  const scene=compileRuntimeScene(project()),base=scene.colliders.find(c=>c.kind==='box'&&c.ownerId==='east')!;
  for(let i=0;i<4000;i++)scene.colliders.push({...base,id:'extra'+i});
  const result=reviewDoorGeometry(scene);expect(result.status).toBe('partial');expect(result.uncheckedDoorIds).toContain('entry');expect(result.pairTests).toBe(250000);
 });
});
