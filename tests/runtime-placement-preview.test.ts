import {describe,it,expect} from 'vitest';
import {furniturePlacementPreview} from '$lib/runtime/placementPreview';
import {applyFurnitureLayoutCommand} from '$lib/runtime/furnitureLayout';
import {compileRuntimeScene} from '$lib/runtime/compileRuntimeScene';
import {compileRuntimeArtifacts} from '$lib/runtime/runtimeArtifacts';
import {readProject} from '$lib/utils/projectValidation';
import {ceilingHosts} from '$lib/utils/ceilingFurniture';
import {runtimeProductProject} from '../tooling/runtime-product-fixture.mjs';

describe('read-only native placement preview',()=>{
  it('previews invalid landing positions without saving a provisional Project',async()=>{
    const project=readProject(await runtimeProductProject()),before=JSON.stringify(project);
    const command={type:'add' as const,floorId:'ground',position:{x:3000,y:3000},asset:{catalogId:'chair'}};
    const preview=furniturePlacementPreview(project,command);
    expect(preview.position[0]).toBe(30);expect(preview.movement.kind).toBe('floor');expect(JSON.stringify(project)).toBe(before);
    const candidate=applyFurnitureLayoutCommand(project,command).project;
    await expect(compileRuntimeArtifacts(candidate,async()=>null)).rejects.toThrow(/fully supported/);
  });
  it('uses the same native wall frame and installation pose as accepted compilation',async()=>{
    const project=readProject(await runtimeProductProject());
    const command={type:'add' as const,floorId:'ground',position:{x:600,y:400},asset:{catalogId:'wall_art'},wallMount:{wallId:'ground-w0',side:'left' as const,elevation:140}};
    const preview=furniturePlacementPreview(project,command),accepted=applyFurnitureLayoutCommand(project,command);
    const entity=compileRuntimeScene(accepted.project).entities.find(e=>e.id===accepted.selectedId)!;
    expect(preview.movement).toEqual(entity.kind==='furniture'?entity.movement:null);
    expect(preview.position).toEqual(entity.kind==='furniture'?entity.position:null);
    expect(preview.size).toEqual(entity.kind==='furniture'?entity.size:null);
    expect(()=>furniturePlacementPreview(project,{...command,wallMount:undefined})).toThrow(/explicit wall/);
    expect(()=>furniturePlacementPreview(project,{...command,wallMount:{...command.wallMount,wallId:'ground-w1'}})).toThrow(/Curved-wall/);
  });
  it('keeps ceiling identity/height explicit and permits red previews over an aperture',async()=>{
    const project=readProject(await runtimeProductProject()),host=ceilingHosts(project.floors[0])[0];
    const command={type:'add' as const,floorId:'ground',position:{x:900,y:500},asset:{catalogId:'ceiling_light'},ceilingMount:{wallIds:host.wallIds}};
    const preview=furniturePlacementPreview(project,command);
    expect(preview.movement).toEqual({kind:'ceiling',roomId:host.id,elevation:3.4});
    expect(()=>applyFurnitureLayoutCommand(project,command)).toThrow(/holes/);
    expect(()=>furniturePlacementPreview(project,{...command,ceilingMount:undefined})).toThrow(/supported ceiling/);
  });
  it('atomically applies replacement landing/rotation and rejects locked previews',async()=>{
    const project=readProject(await runtimeProductProject()),before=JSON.stringify(project);
    const command={type:'replace' as const,floorId:'ground',id:'sofa',position:{x:550,y:250},rotation:90,asset:{catalogId:'chair'}};
    const preview=furniturePlacementPreview(project,command),accepted=applyFurnitureLayoutCommand(project,command);
    const item=accepted.project.floors[0].furniture.find(f=>f.id==='sofa')!;
    expect(item).toMatchObject({position:command.position,rotation:90,catalogId:'chair'});expect(preview.yawClockwiseRadians).toBe(Math.PI/2);
    expect(JSON.stringify(project)).toBe(before);project.floors[0].furniture.find(f=>f.id==='sofa')!.locked=true;
    expect(()=>furniturePlacementPreview(project,command)).toThrow(/unlocked/);
  });
});
