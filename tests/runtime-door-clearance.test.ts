import { describe, expect, it, vi } from 'vitest';
import type { Door } from '$lib/models/types';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { validateFurnitureDoorClearance } from '$lib/runtime/doorClearance';
import { applyFurnitureLayoutCommand } from '$lib/runtime/furnitureLayout';
import { readProject } from '$lib/utils/projectValidation';
import { runtimeWalkthroughProject } from '../tooling/runtime-walkthrough-fixture.mjs';

async function source(type: Door['type'] = 'single') {
  const project = readProject(await runtimeWalkthroughProject()), floor = project.floors[0];
  floor.doors = [{ ...floor.doors.find(d => d.id === 'swing-door')!, type }];
  floor.furniture = [];
  return project;
}
type Source = Awaited<ReturnType<typeof source>>;
function place(p: Source, x: number, y: number, extra = {}) {
  p.floors[0].furniture = [{ id:'placed', catalogId:'chair', position:{x,y}, rotation:0,
    scale:{x:1,y:1,z:1}, width:20, depth:20, height:100, ...extra }];
}
const validate = (p: Source) => validateFurnitureDoorClearance(compileRuntimeScene(p));

describe('furniture clearance at the compiled closed door pose', () => {
  it.each(['single','double','french','sliding','pocket','bifold','garage'] as const)('reserves each explicit %s leaf without inventing motion', async type => {
    const p = await source(type);
    for (const [index,x] of (type === 'double' || type === 'french' ? [275,325] : [300]).entries()) {
      place(p,x,600);
      expect(()=>validate(p)).toThrow(`leaf "door:swing-door:leaf:${index}"`);
    }
  });

  it('preserves leafless passages, even when furniture occupies their host baseline', async () => {
    const p=await source('opening');place(p,300,600);
    await expect(compileRuntimeArtifacts(p,async()=>null)).resolves.toBeDefined();
  });

  it('allows touching faces and sweep-only obstacles but rejects positive closed-volume penetration', async () => {
    const p=await source();place(p,300,612);
    expect(()=>validate(p)).not.toThrow();
    place(p,300,611.9);expect(()=>validate(p)).toThrow('closed pose');
    // This chair can obstruct live swing motion. Its saved closed pose is clear.
    place(p,300,660,{width:80,depth:80});expect(()=>validate(p)).not.toThrow();
  });

  it('uses both authored rotations rather than an axis-aligned envelope', async () => {
    const p=await source(), wall=p.floors[0].walls.find(w=>w.id==='swing')!;
    const rotate=(point:{x:number;y:number})=>({x:300+(point.x-300)/Math.SQRT2,y:600+(point.x-300)/Math.SQRT2});
    wall.start=rotate(wall.start);wall.end=rotate(wall.end);
    place(p,270,630,{width:10,depth:10});expect(()=>validate(p)).not.toThrow();
    place(p,300,600,{width:100,depth:10,rotation:90});expect(()=>validate(p)).toThrow('closed pose');
    const straight=await source();
    place(straight,340,640,{width:100,depth:10});expect(()=>validate(straight)).not.toThrow();
    straight.floors[0].furniture[0].rotation=90;expect(()=>validate(straight)).toThrow('closed pose');
  });

  it('checks height across authored floors and flat non-walking furniture without reading models', async () => {
    const p=await source();place(p,300,600,{height:1});
    expect(compileRuntimeScene(p).colliders.some(c=>c.ownerId==='placed')).toBe(false);
    expect(()=>validate(p)).toThrow('closed pose');
    p.floors[1].furniture=p.floors[0].furniture;p.floors[0].furniture=[];
    expect(()=>validate(p)).not.toThrow();
    p.floors[0].doors[0].height=400;expect(()=>validate(p)).toThrow('closed pose');
  });

  it('blocks every shared export before resolving presentation and retains native edits for correction', async () => {
    const p=await source();place(p,600,600);
    const moved=applyFurnitureLayoutCommand(p,{type:'move',floorId:'ground',id:'placed',position:{x:300,y:600}},new Date(0)).project;
    const before=JSON.stringify(moved), assets=vi.fn(async()=>null);
    await expect(compileRuntimeArtifacts(moved,assets)).rejects.toThrow('Furniture "placed" overlaps the closed pose of door "swing-door"');
    expect(assets).not.toHaveBeenCalled();expect(JSON.stringify(moved)).toBe(before);
    expect(moved.floors[0].furniture[0].position).toEqual({x:300,y:600});
    expect(p.floors[0].furniture[0].position).toEqual({x:600,y:600});
  });
});
