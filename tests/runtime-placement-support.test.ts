import {describe,it,expect} from 'vitest';
import {footprintSupported,validateFurnitureSupport} from '$lib/runtime/placementSupport';
import {compileRuntimeArtifacts} from '$lib/runtime/runtimeArtifacts';
import {readProject} from '$lib/utils/projectValidation';
import {runtimeProductProject} from '../tooling/runtime-product-fixture.mjs';
import type {RuntimeVec2} from '$lib/runtime/types';
const rectangle=(x:number,y:number,w:number,h:number):RuntimeVec2[][]=>[[[x,y],[x+w,y],[x+w,y+h]],[[x,y],[x+w,y+h],[x,y+h]]];
const footprint:RuntimeVec2[]=[[0,0],[2,0],[2,2],[0,2]];
describe('complete furniture footprint support',()=>{
  it('accepts touching boundaries and a union of adjoining surfaces, independent of triangle winding',()=>{
    const triangles=[...rectangle(0,0,1,2),...rectangle(1,0,1,2)];
    expect(footprintSupported(footprint,triangles)).toBe(true);
    expect(footprintSupported(footprint,triangles.map(t=>[...t].reverse()))).toBe(true);
  });
  it('rejects a thin hole missed by centre/corner sampling, even with duplicate overlapping supports',()=>{
    const supports=[...rectangle(0,0,.4,2),...rectangle(.42,0,1.58,2)];
    expect(footprintSupported(footprint,supports)).toBe(false);
    expect(footprintSupported(footprint,[...supports,...supports,...supports])).toBe(false);
  });
  it('rejects a concave bite and an entirely internal hole',()=>{
    expect(footprintSupported(footprint,[...rectangle(0,0,2,.5),...rectangle(0,.5,.5,1.5)])).toBe(false);
    const ring=[...rectangle(0,0,2,.4),...rectangle(0,.6,2,1.4),...rectangle(0,.4,.4,.2),...rectangle(.6,.4,1.4,.2)];
    expect(footprintSupported(footprint,ring)).toBe(false);
    const c=Math.cos(.6),s=Math.sin(.6),rotate=(p:RuntimeVec2):RuntimeVec2=>[c*p[0]-s*p[1],s*p[0]+c*p[1]];
    expect(footprintSupported(footprint.map(rotate),ring.map(t=>t.map(rotate)))).toBe(false);
  });
  it('blocks unsupported native furniture at the shared export boundary and keeps the source editable',async()=>{
    const project=readProject(await runtimeProductProject()),floor=project.floors[0];
    floor.furniture.find(f=>f.id==='sofa')!.position={x:2000,y:2000};
    const before=JSON.stringify(project);
    await expect(compileRuntimeArtifacts(project,async()=>null)).rejects.toThrow(/sofa.*fully supported/);
    expect(JSON.stringify(project)).toBe(before);expect(readProject(project)).toEqual(project);
  });
  it('rejects a native 1cm slit between all five former sample points',async()=>{
    const project=readProject(await runtimeProductProject());
    project.floors[0].rooms.push({id:'slit',name:'slit',walls:[],floorTexture:'concrete',area:0,floorOpening:true,
      boundary:[[470,150],[471,150],[471,250],[470,250]].map(([x,y])=>({point:{x,y}}))});
    await expect(compileRuntimeArtifacts(project,async()=>null)).rejects.toThrow(/sofa.*fully supported/);
  });
});
