import { appendBox, type MeshBuilder } from './presentationGeometry';
import { compileRuntimeWallPathProfile } from './wallPathGeometry';
import type { Plan2WorldRuntimeSceneV1, RuntimeWallEntity } from './types';

/** Compiler-owned opening bands, visible only in the plan presentation profile.
 * They mark authored apertures above lintels; collision/motion stay independent. */
export function compilePlanOpenings(scene: Plan2WorldRuntimeSceneV1) {
  const walls = new Map(scene.entities.filter((e): e is RuntimeWallEntity => e.kind==='wall').map(e=>[e.id,e]));
  return scene.entities.flatMap(entity => {
    if (entity.kind!=='door' && entity.kind!=='window') return [];
    const wall=walls.get(entity.hostWallId); if (!wall || !wall.visible) return [];
    const profile=compileRuntimeWallPathProfile(wall),center=profile.distanceAt(entity.pathPosition);
    const from=Math.max(0,center-entity.width/2),to=Math.min(profile.length,center+entity.width/2);
    const knots=[from,...profile.nodes.map(n=>n.distance).filter(d=>d>from && d<to),to];
    const mesh:MeshBuilder={positions:[],normals:[],uvs:[],indices:[]};
    const elevation=scene.floors.find(f=>f.id===entity.floorId)!.elevation+Math.max(wall.startHeight,wall.endHeight)+.025;
    for(let i=0;i<knots.length-1;i++) {
      const a=profile.sampleDistance(knots[i]).point,b=profile.sampleDistance(knots[i+1]).point;
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]); if(length<=1e-9)continue;
      appendBox(mesh,[(a[0]+b[0])/2,elevation,(a[1]+b[1])/2],[length,.01,wall.thickness+0.035],Math.atan2(b[1]-a[1],b[0]-a[0]));
    }
    return mesh.indices.length ? [{ ...mesh,id:`architecture:plan:${entity.id}`,ownerId:entity.id,floorId:entity.floorId,
      kind:entity.kind==='door'?'plan-door' as const:'plan-window' as const,
      material:entity.kind==='door'?'plan-door' as const:'plan-window' as const,view:'plan' as const }] : [];
  });
}
