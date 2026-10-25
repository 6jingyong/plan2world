import { describe,expect,it } from 'vitest';
import { roomProject } from './fixtures/project';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { compilePlanOpenings } from '$lib/runtime/planOpeningMesher';
import { compileArchitecturePresentation } from '$lib/runtime/architecturePresentation';
import { serializeArchitectureGlb } from '$lib/runtime/architectureGlb';
import { compileRuntimeWallPathProfile } from '$lib/runtime/wallPathGeometry';

function project(curved=false) {
  const p=roomProject(),f=p.floors[0];f.elevation=40;
  if(curved)f.walls[0].curvePoint={x:200,y:-80};
  f.doors=[{id:'door',wallId:f.walls[0].id,position:.25,width:90,height:210,type:'single',swingDirection:'left',flipSide:false}];
  f.windows=[{id:'window',wallId:f.walls[0].id,position:.7,width:100,height:120,sillHeight:90,type:'fixed'}];
  return p;
}
describe('compiler-owned plan opening markers',()=>{
  it.each([false,true])('marks true physical aperture widths above lintels with stable ownership (curve=%s)',curve=>{
    const source=project(curve),before=JSON.stringify(source),scene=compileRuntimeScene(source);
    const semantics=JSON.stringify(scene),markers=compilePlanOpenings(scene);
    expect(markers.map(p=>[p.ownerId,p.kind,p.view])).toEqual([['door','plan-door','plan'],['window','plan-window','plan']]);
    for(const marker of markers) {
      expect(marker.positions.every(p=>p[1]>2.9)).toBe(true);
      expect(marker.indices.length%3).toBe(0);
      const entity=scene.entities.find(e=>e.id===marker.ownerId)!;
      if(entity.kind!=='door' && entity.kind!=='window')throw new Error('Expected opening');
      const wall=scene.entities.find(e=>e.kind==='wall' && e.id===entity.hostWallId)!;
      if(wall.kind!=='wall')throw new Error('Expected wall');
      const profile=compileRuntimeWallPathProfile(wall);
      const from=profile.distanceAt(entity.pathPosition)-entity.width/2,to=from+entity.width;
      const a=profile.sampleDistance(from).point,b=profile.sampleDistance(to).point;
      const xs=marker.positions.map(p=>p[0]);
      expect(Math.min(...xs)).toBeCloseTo(Math.min(a[0],b[0]),curve?1:5);
      expect(Math.max(...xs)).toBeCloseTo(Math.max(a[0],b[0]),curve?1:5);
    }
    expect(JSON.stringify(scene)).toBe(semantics);expect(JSON.stringify(source)).toBe(before);
    expect(compilePlanOpenings(scene)).toEqual(markers);
    const mesh=compileArchitecturePresentation(scene),glb=serializeArchitectureGlb(mesh),view=new DataView(glb.buffer);
    const json=JSON.parse(new TextDecoder().decode(glb.subarray(20,20+view.getUint32(12,true))).trim());
    expect(json.nodes.filter((n:any)=>n.extras.plan2world.view==='plan').map((n:any)=>n.extras.plan2world.ownerId)).toEqual(['door','window']);
    expect(serializeArchitectureGlb(compileArchitecturePresentation(scene))).toEqual(glb);
  });
});
