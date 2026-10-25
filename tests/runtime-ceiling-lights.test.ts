import { describe, expect, it } from 'vitest';
import { roomProject } from './fixtures/project';
import { ceilingHosts, furnitureCeilingFrame, lightColor } from '$lib/utils/ceilingFurniture';
import { applyFurnitureLayoutCommand, furnitureLayoutCatalog } from '$lib/runtime/furnitureLayout';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { readProject } from '$lib/utils/projectValidation';
import { readProjectPackage, projectPackageBytes } from '$lib/utils/projectPackageCodec';
import { createPlacedFurnitureModel } from '$lib/utils/furnitureModelLoader';
import * as THREE from 'three';
import { disposeModel } from '$lib/utils/furnitureModelResources';

function mounted(id='ceiling_light') {
  const input=roomProject(),floor=input.floors[0];floor.walkthroughStart={x:80,y:80};
  const host=ceilingHosts(floor)[0];
  return applyFurnitureLayoutCommand(input,{type:'add',floorId:floor.id,position:{x:200,y:150},asset:{catalogId:id},ceilingMount:{wallIds:host.wallIds}},new Date(0));
}
describe('native ceiling furniture and emitted light semantics',()=>{
  it.each(['ceiling_light','chandelier','recessed_light','pendant_light'])('attaches %s to the authored ceiling, independent of presentation and collision',async id=>{
    const {project,selectedId}=mounted(id),floor=project.floors[0],item=floor.furniture[0];
    const before=JSON.stringify(project),scene=compileRuntimeScene(project),entity=scene.entities.find(e=>e.id===selectedId)!;
    if(entity.kind!=='furniture')throw new Error('Expected furniture');
    expect(entity.movement).toMatchObject({kind:'ceiling',elevation:2.5,roomId:scene.floors[0].rooms[0].id});
    expect(entity.position[1]+entity.size[1]/2).toBeCloseTo(2.5);
    expect(entity.assetRef).toBe(`builtin:${id}-v1`);expect(entity.light?.kind).toBe(id==='recessed_light'?'spot':'omni');
    expect(entity.light?.localPosition[1]).toBeLessThan(-entity.size[1]/2);
    expect(scene.colliders.find(c=>c.ownerId===entity.id)).toMatchObject({kind:'box',center:entity.position,size:entity.size});
    expect(item.ceilingMount?.wallIds).toEqual(ceilingHosts(floor)[0].wallIds);
    const artifacts=await compileRuntimeArtifacts(project,async()=>null);
    expect(artifacts.assets.diagnostics).toEqual([]);expect(artifacts.assets.manifest.assets.some(a=>a.id===entity.assetRef)).toBe(true);
    expect(JSON.stringify(project)).toBe(before);
    const again=await compileRuntimeArtifacts(project,async()=>null);
    expect(again.runtime).toEqual(artifacts.runtime);expect(again.architectureGlb).toEqual(artifacts.architectureGlb);expect(again.assets.files).toEqual(artifacts.assets.files);
  });
  it('does not infer a ceiling from an unbound legacy light or change its source',()=>{
    const source=roomProject(),floor=source.floors[0];
    const before=JSON.stringify(source);
    expect(()=>applyFurnitureLayoutCommand(source,{type:'add',floorId:floor.id,position:{x:200,y:150},asset:{catalogId:'ceiling_light'}})).toThrow('Choose an authored ceiling');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('retains explicit host/height and rejects vertical movement, exterior placement and arbitrary rebinding',()=>{
    const {project,selectedId}=mounted(),floor=project.floors[0],id=selectedId!;
    const moved=applyFurnitureLayoutCommand(project,{type:'move',floorId:floor.id,id,position:{x:210,y:160}}).project;
    expect(moved.floors[0].furniture[0].ceilingMount).toEqual(floor.furniture[0].ceilingMount);
    expect(()=>applyFurnitureLayoutCommand(project,{type:'move',floorId:floor.id,id,position:{x:200,y:150},elevation:120})).toThrow('cannot change elevation');
    expect(()=>applyFurnitureLayoutCommand(project,{type:'move',floorId:floor.id,id,position:{x:900,y:150}})).toThrow('fully beneath');
    const invalid=structuredClone(project);invalid.floors[0].furniture[0].ceilingMount={wallIds:['deleted']};
    expect(()=>readProject(invalid)).toThrow('existing ceiling boundary');
    const collapsed=structuredClone(project);collapsed.floors[0].furniture[0].scale.z=0;
    expect(()=>compileRuntimeScene(collapsed)).toThrow('positive effective dimensions');
  });
  it('rejects holes even when all footprint corners and centre miss a small aperture',()=>{
    const {project}=mounted();const floor=project.floors[0],item=floor.furniture[0];
    floor.rooms.push({id:'aperture',name:'Aperture',walls:[],floorTexture:'concrete',area:0,floorOpening:true,boundary:[[205,155],[210,155],[210,160],[205,160]].map(([x,y])=>({point:{x,y}}))});
    expect(()=>furnitureCeilingFrame(floor,item)).toThrow('clear of holes');
  });
  it('does not manufacture ceilings for outdoor, explicit ground or sloped/unequal tops',()=>{
    const source=roomProject(),floor=source.floors[0];
    floor.walls[0].endHeight=280;
    expect(ceilingHosts(floor)).toEqual([]);
    floor.walls=[];floor.rooms=[{id:'outdoor',name:'Outdoor',walls:[],floorTexture:'concrete',area:0,roomType:'outdoor',boundary:[[0,0],[400,0],[400,300],[0,300]].map(([x,y])=>({point:{x,y}}))}];
    expect(ceilingHosts(floor)).toEqual([]);
  });
  it('persists light settings and ceiling binding without changing architecture or asset bytes',async()=>{
    const {project,selectedId}=mounted(),floor=project.floors[0];
    const edited=applyFurnitureLayoutCommand(project,{type:'light',floorId:floor.id,id:selectedId!,light:{enabled:false,lumens:750,temperatureKelvin:6500}}).project;
    expect(edited.floors[0].walls).toEqual(floor.walls);expect(edited.floors[0].rooms).toEqual(floor.rooms);
    const returned=readProjectPackage(projectPackageBytes(edited)).project;
    expect(returned.floors[0].furniture[0]).toMatchObject({ceilingMount:floor.furniture[0].ceilingMount,light:{enabled:false,lumens:750,temperatureKelvin:6500}});
    const a=await compileRuntimeArtifacts(project,async()=>null),b=await compileRuntimeArtifacts(edited,async()=>null);
    expect(b.architectureGlb).toEqual(a.architectureGlb);expect(b.assets.files).toEqual(a.assets.files);expect(b.runtime.colliders).toEqual(a.runtime.colliders);
    const light=b.runtime.entities.find(e=>e.kind==='furniture')!;
    if(light.kind!=='furniture')throw new Error('Expected furniture');
    expect(light.light).toMatchObject({enabled:false,lumens:750,temperatureKelvin:6500});
    expect(lightColor(2700)[2]).toBeLessThan(lightColor(6500)[2]);
  });
  it('keeps one native identity when replacing light type and clears attachment on deliberate floor replacement',()=>{
    const {project,selectedId}=mounted(),floor=project.floors[0];
    const lamp=applyFurnitureLayoutCommand(project,{type:'replace',floorId:floor.id,id:selectedId!,asset:{catalogId:'pendant_light'}}).project;
    expect(lamp.floors[0].furniture[0].ceilingMount).toEqual(floor.furniture[0].ceilingMount);
    const grounded=applyFurnitureLayoutCommand(lamp,{type:'replace',floorId:floor.id,id:selectedId!,asset:{catalogId:'chair'}}).project.floors[0].furniture[0];
    expect(grounded.id).toBe(selectedId);expect(grounded.ceilingMount).toBeUndefined();expect(grounded.light).toBeUndefined();
    expect(furnitureLayoutCatalog(project).filter(c=>c.mounting==='ceiling')).toHaveLength(4);
  });
  it('keeps internal browser review tokens attached to the same ceiling without adding a browser runtime',()=>{
    const {project}=mounted('pendant_light'),item=project.floors[0].furniture[0];
    item.scale.z=1.4;
    const model=createPlacedFurnitureModel(item,undefined,project)!;
    model.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(model).max.y).toBeCloseTo(250);
    expect(item.position).toEqual({x:200,y:150});disposeModel(model);
  });
});
