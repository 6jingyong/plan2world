import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '$lib/models/projectDefaults';
import { readProject } from '$lib/utils/projectValidation';
import { applyNativeEditCommand } from '$lib/runtime/nativeEditing';
import { nativeArchitectureEditor } from '$lib/runtime/architectureEditing';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { projectPackageBytes, readProjectPackage } from '$lib/utils/projectPackageCodec';
import { wallPointAt } from '$lib/utils/wallPath';

function fixture() {
  const p = createDefaultProject('Synthetic correction room'), f = p.floors[0];
  f.id = p.activeFloorId = 'floor';
  f.walls = [[0,0,600,0],[600,0,600,600],[600,600,0,600],[0,600,0,0]].map(([x,y,a,b],i) => ({ id:`w${i}`,start:{x,y},end:{x:a,y:b},height:280,thickness:15,color:'#444444' }));
  f.doors = [{id:'door',wallId:'w0',position:.25,width:90,height:210,type:'single',swingDirection:'left',flipSide:false}];
  f.entrance={doorId:'door',side:'left'};
  p.architectureReview={version:1,issues:[{id:'i',floorId:f.id,message:'Synthetic missing partition',position:{x:300,y:300},sourceRecord:'immutable original source',resolved:false}]};
  return readProject(p);
}
describe('native architecture correction and independent door appearance', () => {
  it('moves an exact junction, changes the derived floor, and preserves the input and source notes', async () => {
    const p=fixture(), before=JSON.stringify(p), source=p.architectureReview;
    const edited=applyNativeEditCommand(p,{type:'wall-update',floorId:'floor',id:'w0',start:{x:0,y:-100},end:{x:600,y:-100},thickness:15,height:280});
    expect(edited.updateKind).toBe('architecture');
    expect(edited.project.floors[0].walls[1].start.y).toBe(-100);expect(edited.project.floors[0].walls[3].end.y).toBe(-100);
    const a=compileRuntimeScene(p),b=compileRuntimeScene(edited.project);
    expect(b.floors[0].rooms).not.toEqual(a.floors[0].rooms);
    expect(edited.project.architectureReview).toEqual(source);expect(JSON.stringify(p)).toBe(before);
    await expect(compileRuntimeArtifacts(edited.project,async()=>null)).resolves.toBeDefined();
  });
  it('splits without moving a door, preserves boundary references, and rejects a cut through its aperture',()=>{
    const p=fixture(), f=p.floors[0], before=JSON.stringify(p), center=wallPointAt(f.walls[0],f.doors[0].position);
    f.rooms.push({id:'ground',name:'Explicit ground',walls:f.walls.map(w=>w.id),floorTexture:'wood',area:36,boundary:f.walls.map(w=>({wallId:w.id}))});
    const result=applyNativeEditCommand(p,{type:'wall-split',floorId:'floor',id:'w0',at:.6}),out=result.project.floors[0];
    expect(out.walls).toHaveLength(5);expect(wallPointAt(out.walls.find(w=>w.id===out.doors[0].wallId)!,out.doors[0].position)).toEqual(center);
    expect(out.rooms.find(r=>r.id==='ground')!.boundary).toHaveLength(5);
    expect(()=>applyNativeEditCommand(p,{type:'wall-split',floorId:'floor',id:'w0',at:.25})).toThrow(/outside.*opening/);
    expect(JSON.stringify(f.doors)).toBe(JSON.stringify(JSON.parse(before).floors[0].doors));
  });
  it('retains an exact quadratic path and endpoint taper when splitting',()=>{
    const p=fixture(), w=p.floors[0].walls[2];w.curvePoint={x:300,y:650};w.startHeight=240;w.endHeight=300;w.height=300;
    const result=applyNativeEditCommand(p,{type:'wall-split',floorId:'floor',id:w.id,at:.4}),walls=result.project.floors[0].walls;
    const first=walls.find(x=>x.id===w.id)!,second=walls.find(x=>x.id===result.selectedId)!;
    for(const t of [.1,.3,.7,.9]){
      const expected=wallPointAt(w,t),actual=t<=.4?wallPointAt(first,t/.4):wallPointAt(second,(t-.4)/.6);
      expect(actual.x).toBeCloseTo(expected.x,10);expect(actual.y).toBeCloseTo(expected.y,10);
    }
    expect(first.endHeight).toBe(264);expect(second.startHeight).toBe(264);
  });
  it('will not silently discard doors, explicit floors, or mounted-item dependencies',()=>{
    const p=fixture(),before=JSON.stringify(p);
    expect(()=>applyNativeEditCommand(p,{type:'wall-remove',floorId:'floor',id:'w0'})).toThrow(/attached/);
    expect(()=>applyNativeEditCommand(p,{type:'wall-update',floorId:'floor',id:'w1',start:{x:0,y:0},end:{x:0,y:0},height:280,thickness:15})).toThrow(/different/);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('keeps a broken plan editable, adds a missing wall and explicitly rehosts an opening',async()=>{
    const p=fixture(),deleted=applyNativeEditCommand(p,{type:'wall-remove',floorId:'floor',id:'w2'}).project;
    expect(readProject(deleted)).toBeDefined();
    await expect(compileRuntimeArtifacts(deleted,async()=>null)).rejects.toThrow();
    const restored=applyNativeEditCommand(deleted,{type:'wall-add',floorId:'floor',start:{x:600,y:600},end:{x:0,y:600}});
    const out=applyNativeEditCommand(restored.project,{type:'opening-update',floorId:'floor',id:'door',wallId:restored.selectedId!,position:.25,width:90,height:210,doorType:'single'}).project;
    const entrance=applyNativeEditCommand(out,{type:'set-entrance',floorId:'floor',id:'door',side:'left'}).project;
    await expect(compileRuntimeArtifacts(entrance,async()=>null)).resolves.toBeDefined();
  });
  it.each(['wood','glass','steel'] as const)('changes %s appearance without changing physics, motion, or architecture',async material=>{
    const p=fixture(),before=JSON.stringify(p),result=applyNativeEditCommand(p,{type:'door-material',floorId:'floor',id:'door',material});
    const reopened=readProjectPackage(projectPackageBytes(result.project)).project;
    expect(reopened.floors[0].doors[0].material).toBe(material);
    expect(reopened.architectureReview).toEqual(p.architectureReview);
    const a=await compileRuntimeArtifacts(p,async()=>null),b=await compileRuntimeArtifacts(reopened,async()=>null);
    expect(b.architectureGlb).toEqual(a.architectureGlb);expect(b.runtime.colliders).toEqual(a.runtime.colliders);
    const clean=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,v)=>key==='assetRef'?undefined:v));
    expect(clean(b.runtime.entities)).toEqual(clean(a.runtime.entities));expect(JSON.stringify(p)).toBe(before);
    const ref=material==='wood'?'builtin:door-leaf-v1':`builtin:door-${material}-leaf-v1`;
    expect(b.assets.manifest.assets.some(a=>a.id===ref)).toBe(true);
  });
  it('persists source notes independently of geometry and requires explicit review acknowledgement',()=>{
    const p=fixture(),out=applyNativeEditCommand(p,{type:'resolve-architecture-issue',floorId:'floor',id:'i',resolved:true}).project;
    expect(out.architectureReview!.issues[0].sourceRecord).toBe(p.architectureReview!.issues[0].sourceRecord);
    expect(out.architectureReview!.issues[0].resolved).toBe(true);expect(p.architectureReview!.issues[0].resolved).toBe(false);
    expect(nativeArchitectureEditor(out).floors[0].walls[0].points).toEqual([p.floors[0].walls[0].start,p.floors[0].walls[0].end]);
  });
});
