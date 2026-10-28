import { describe,expect,it } from 'vitest';
import { createDefaultProject } from '$lib/models/projectDefaults';
import { readProject } from '$lib/utils/projectValidation';
import { applyNativeEditCommand } from '$lib/runtime/nativeEditing';
import { nativeArchitectureEditor } from '$lib/runtime/architectureEditing';
import { spatialAuthoringPreview } from '$lib/runtime/spatialAuthoring';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { floorPerimeter } from '$lib/runtime/floorPerimeter';
import type { RuntimeRoomSurface,RuntimeVec2 } from '$lib/runtime/types';
const rectangle=(x:number,y:number,w:number,h:number):RuntimeVec2[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const surface=(id:string,polygon:RuntimeVec2[],holes:RuntimeVec2[][]=[]):RuntimeRoomSurface=>({id,name:id,roomType:'outdoor',polygon,holes,slabThickness:.05,ceilingHeight:null});
function fixture(){
 const p=createDefaultProject('Spatial authoring'),f=p.floors[0];f.id=p.activeFloorId='f';
 f.walls=[[0,0,600,0],[600,0,600,600],[600,600,0,600],[0,600,0,0]].map(([x,y,a,b],i)=>({id:`w${i}`,start:{x,y},end:{x:a,y:b},height:280,thickness:15,color:'#444'}));
 f.walkthroughStart={x:300,y:300};return readProject(p);
}
describe('accepted ground envelope',()=>{
 it('closes an open ground surface without adding native walls or presentation',()=>{
  const p=fixture(),before=JSON.stringify(p);
  const result=applyNativeEditCommand(p,{type:'floor-area-add',floorId:'f',points:[{x:600,y:0},{x:900,y:0},{x:900,y:600},{x:600,y:600}]});
  const saved=readProject(JSON.parse(JSON.stringify(result.project))),scene=compileRuntimeScene(saved);
  expect(saved.floors[0].walls).toEqual(p.floors[0].walls);
  expect(nativeArchitectureEditor(saved).floors[0].groundAreas[0].id).toBe(result.selectedId);
  expect(scene.colliders.some(c=>c.kind==='box'&&c.purpose==='perimeter'&&c.center[0]>9)).toBe(true);
  expect(JSON.stringify(p)).toBe(before);
 });
 it('removes the entire shared seam of adjoining ground areas',()=>{
  const guards=floorPerimeter([surface('a',rectangle(0,0,4,4)),surface('b',rectangle(4,1,3,2))],'f',0);
  expect(guards.filter(c=>Math.abs(c.center[0]-4)<.02&&c.center[2]>1&&c.center[2]<3)).toHaveLength(0);
  expect(guards.every(c=>c.purpose==='perimeter'&&!c.dynamic)).toBe(true);
 });
 it('has no internal guard in overlapping floors and retains a concave recess',()=>{
  const guards=floorPerimeter([surface('a',rectangle(0,0,4,4)),surface('b',rectangle(2,2,4,4))],'f',3);
  expect(guards.some(c=>Math.abs(c.center[0]-4)<.02&&c.center[2]>2&&c.center[2]<4)).toBe(false);
  expect(guards.some(c=>Math.abs(c.center[2]-4)<.02&&c.center[0]>4&&Math.abs(Math.sin(c.yawClockwiseRadians))<.01)).toBe(false);
  expect(guards.every(c=>c.center[1]===4.4)).toBe(true);
 });
 it('leaves slab holes open and separately encloses disconnected areas',()=>{
  const guards=floorPerimeter([surface('a',rectangle(0,0,6,6),[rectangle(2,2,2,2)]),surface('b',rectangle(10,0,2,2))],'f',0);
  expect(guards).toHaveLength(8);
  expect(guards.some(c=>c.center[0]>1.9&&c.center[0]<4.1&&c.center[2]>1.9&&c.center[2]<4.1)).toBe(false);
 });
 it('protects live curve and wall-referenced ground from polygon flattening',()=>{
  const p=fixture(),f=p.floors[0];f.rooms.push({id:'curved-ground',name:'Retained curve',walls:[],floorTexture:'wood',area:1,boundary:[{point:{x:700,y:0},curvePoint:{x:900,y:100}},{point:{x:800,y:200}},{point:{x:700,y:200}}]});
  const before=JSON.stringify(p);
  expect(nativeArchitectureEditor(p).floors[0].groundAreas[0].editable).toBe(false);
  expect(()=>applyNativeEditCommand(p,{type:'floor-area-update',floorId:'f',id:'curved-ground',points:[{x:700,y:0},{x:800,y:200},{x:700,y:200}]})).toThrow(/live wall\/curve/);
  expect(JSON.stringify(p)).toBe(before);
 });
 it('rejects crossing ground, supports explicit adjustment/removal, and never changes source notes',()=>{
  const p=fixture();p.architectureReview={version:1,sourceObservations:'frozen',issues:[]};const before=JSON.stringify(p);
  expect(()=>applyNativeEditCommand(p,{type:'floor-area-add',floorId:'f',points:[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]})).toThrow(/non-crossing/);
  const a=applyNativeEditCommand(p,{type:'floor-area-add',floorId:'f',points:[{x:600,y:0},{x:900,y:0},{x:900,y:600},{x:600,y:600}]});
  const b=applyNativeEditCommand(a.project,{type:'floor-area-update',floorId:'f',id:a.selectedId!,points:[{x:600,y:0},{x:800,y:0},{x:800,y:600},{x:600,y:600}]});
  expect(b.project.architectureReview).toEqual(p.architectureReview);
  expect(applyNativeEditCommand(b.project,{type:'floor-area-remove',floorId:'f',id:a.selectedId!}).project.floors[0].rooms.some(r=>r.id===a.selectedId)).toBe(false);
  expect(JSON.stringify(p)).toBe(before);
 });
});
describe('protected walls and shared opening placement',()=>{
 it('marks every actually changed junction wall and requires explicit repeat correction',()=>{
  const p=fixture(),c={type:'wall-update' as const,floorId:'f',id:'w0',start:{x:0,y:-20},end:{x:600,y:-20},thickness:15,height:280};
  const out=applyNativeEditCommand(p,c).project;
  expect(out.floors[0].walls.filter(w=>w.authorModified).map(w=>w.id)).toEqual(['w0','w1','w3']);
  const second={...c,start:{x:0,y:-30},end:{x:600,y:-30}};
  expect(()=>applyNativeEditCommand(out,second)).toThrow(/protected/);
  expect(()=>applyNativeEditCommand(out,{...second,confirmWallEdit:true})).not.toThrow();
  expect(out).not.toHaveProperty('history');
  const opened=applyNativeEditCommand(out,{type:'opening-add',floorId:'f',kind:'door',wallId:'w0',position:.5,width:90});
  expect(opened.project.floors[0].walls).toEqual(out.floors[0].walls);
 });
 it('projects an explicit wall pick and retains selected door material/window type',()=>{
  const p=fixture(),before=JSON.stringify(p);
  const preview=spatialAuthoringPreview(p,{type:'opening-placement',floorId:'f',kind:'door',wallId:'w0',point:{x:200,y:4},width:90,material:'glass'});
  expect(preview.command).toMatchObject({type:'opening-add',material:'glass'});
  expect('position' in preview.command && preview.command.position).toBeCloseTo(1/3,14);
  expect(preview.outline[0].x).toBeCloseTo(155,7);expect(preview.outline.at(-1)!.x).toBeCloseTo(245,7);
  expect(JSON.stringify(p)).toBe(before);
  const w=spatialAuthoringPreview(p,{type:'opening-placement',floorId:'f',kind:'window',wallId:'w1',point:{x:605,y:200},width:120,windowType:'casement'});
  expect(applyNativeEditCommand(p,w.command).project.floors[0].windows[0].type).toBe('casement');
 });
 it('rejects outside/overlapping apertures instead of clamping, erasing or stretching a wall',()=>{
  const p=fixture(),before=JSON.stringify(p);
  expect(()=>spatialAuthoringPreview(p,{type:'opening-placement',floorId:'f',kind:'door',wallId:'w0',point:{x:5,y:0},width:90})).toThrow();
  const added=applyNativeEditCommand(p,{type:'opening-add',floorId:'f',kind:'door',wallId:'w0',position:.5,width:90});
  expect(()=>spatialAuthoringPreview(added.project,{type:'opening-placement',floorId:'f',kind:'window',wallId:'w0',point:{x:310,y:0},width:100})).toThrow();
  expect(JSON.stringify(p)).toBe(before);
 });
 it('moves existing opening geometry without changing its motion, material or wall marks',()=>{
  const a=applyNativeEditCommand(fixture(),{type:'opening-add',floorId:'f',kind:'door',wallId:'w0',position:.5,width:90,material:'steel'});
  const before=a.project.floors[0].doors[0];before.swingDirection='right';before.flipSide=true;
  const preview=spatialAuthoringPreview(a.project,{type:'opening-placement',floorId:'f',kind:'door',id:a.selectedId!,wallId:'w1',point:{x:600,y:250},width:80});
  const moved=applyNativeEditCommand(a.project,preview.command).project;
  expect(moved.floors[0].doors[0]).toMatchObject({material:'steel',swingDirection:'right',flipSide:true,wallId:'w1',width:80});
  expect(moved.floors[0].walls).toEqual(a.project.floors[0].walls);
 });
});
