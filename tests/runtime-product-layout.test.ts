import { describe, it, expect } from 'vitest';
import { applyFurnitureLayoutCommand } from '$lib/runtime/furnitureLayout';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { readProject } from '$lib/utils/projectValidation';
import { projectPackageBytes, readProjectPackage } from '$lib/utils/projectPackageCodec';
import { runtimeWalkthroughProject } from '../tooling/runtime-walkthrough-fixture.mjs';
import { createHash } from 'node:crypto';
const now = new Date(0);
async function source() {
  const p = readProject(await runtimeWalkthroughProject()), f = p.floors[0];
  f.doors.push({ id: 'main-entry', wallId: 'ground-w0', position: .25, width: 100, height: 220, type: 'single', swingDirection: 'left', flipSide: false });
  f.entrance = { doorId: 'main-entry', side: 'left' };
  delete f.walkthroughStart;
  return p;
}
describe('native entrance and furniture movement contracts', () => {
  it('compiles a fixed main-door interior spawn and facing without mutating source', async () => {
    const p = await source(), before = JSON.stringify(p);
    const first = await compileRuntimeArtifacts(p, async () => null), second = await compileRuntimeArtifacts(p, async () => null);
    expect(first.runtime.floors[0]).toMatchObject({ entranceDoorId: 'main-entry', walkthroughStart: [3,.4,.5], walkthroughYawClockwiseRadians: Math.PI/2 });
    expect(second.runtime).toEqual(first.runtime); expect(second.architectureGlb).toEqual(first.architectureGlb);
    expect(first.runtime.source.architectureSha256).toBe(createHash('sha256').update(first.architectureGlb).digest('hex'));
    expect(JSON.stringify(p)).toBe(before);
    const blocked = applyFurnitureLayoutCommand(p, { type:'move', floorId:'ground', id:'sofa', position:{x:300,y:50} },now);
    await expect(compileRuntimeArtifacts(blocked.project,async()=>null)).rejects.toThrow('blocked');
  });
  it('rejects an unsupported/outside explicit start instead of silently relocating it', async () => {
    const p = await source(), f = p.floors[0]; delete f.entrance; f.walkthroughStart={x:3000,y:3000};
    await expect(compileRuntimeArtifacts(p,async()=>null)).rejects.toThrow('supported floor');
    f.entrance={doorId:'main-entry',side:'right'}; delete f.walkthroughStart;
    await expect(compileRuntimeArtifacts(p,async()=>null)).rejects.toThrow('supported floor');
    f.entrance={doorId:'missing',side:'left'};
    expect(()=>readProject(p)).toThrow('existing door');
    f.entrance={doorId:'main-entry',side:'left'};
    p.floors[1].entrance={doorId:'main-entry',side:'left'};
    expect(()=>readProject(p)).toThrow('project main entrance');
  });
  it('compiles explicit wall frames, projects only along the chosen host, and preserves native package binding', async () => {
    const p=await source();
    const a=applyFurnitureLayoutCommand(p,{type:'add',floorId:'ground',position:{x:600,y:600},asset:{catalogId:'wall_art'},wallMount:{wallId:'ground-w0',side:'left',elevation:140}},now);
    const id=a.selectedId!;
    const moved=applyFurnitureLayoutCommand(a.project,{type:'move',floorId:'ground',id,position:{x:650,y:500},elevation:150},now);
    const item=moved.project.floors[0].furniture.find(i=>i.id===id)!;
    expect(item.position.x).toBe(650); expect(item.position.y).toBeCloseTo(12.6); expect(item.wallMount!.elevation).toBe(150);
    const runtime=compileRuntimeScene(moved.project).entities.find(e=>e.id===id)!;
    expect(runtime).toMatchObject({kind:'furniture',position:[6.5,2.2,.126],movement:{kind:'wall',wallId:'ground-w0',tangent:[1,0,0],along:[.4,11.6],bottom:[0,2.4]}});
    const reopened=readProjectPackage(projectPackageBytes(moved.project)).project;
    expect(reopened.floors[0].furniture.find(i=>i.id===id)!.wallMount).toEqual(item.wallMount);
    expect(()=>applyFurnitureLayoutCommand(moved.project,{type:'rotate',floorId:'ground',id,rotation:90},now)).toThrow('authored wall');
    expect(()=>applyFurnitureLayoutCommand(moved.project,{type:'move',floorId:'ground',id,position:{x:300,y:0},elevation:0},now)).toThrow('door or window opening');
  });
  it('requires explicit wall identity, disallows floor elevation, and does not guess curved attachment', async () => {
    const p=await source();
    expect(()=>applyFurnitureLayoutCommand(p,{type:'add',floorId:'ground',position:{x:600,y:600},asset:{catalogId:'wall_art'}},now)).toThrow('authored wall');
    expect(()=>applyFurnitureLayoutCommand(p,{type:'move',floorId:'ground',id:'sofa',position:{x:600,y:600},elevation:100},now)).toThrow('cannot change elevation');
    expect(()=>applyFurnitureLayoutCommand(p,{type:'add',floorId:'ground',position:{x:600,y:600},asset:{catalogId:'wall_art'},wallMount:{wallId:'ground-w1',side:'left',elevation:140}},now)).toThrow('Curved-wall');
    p.floors[0].textAnnotations.push({id:'layout-furniture-1',x:10,y:10,text:'reserved',fontSize:16,color:'#000',rotation:0});
    expect(applyFurnitureLayoutCommand(p,{type:'add',floorId:'ground',position:{x:600,y:600},asset:{catalogId:'chair'}},now).selectedId).toBe('layout-furniture-2');
  });
});
