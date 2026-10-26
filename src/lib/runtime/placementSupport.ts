import type { Plan2WorldRuntimeSceneV1, RuntimeFurnitureEntity, RuntimeVec2 } from './types';

type Polygon=RuntimeVec2[];
const EPS=1e-11;
const cross=(a:RuntimeVec2,b:RuntimeVec2,p:RuntimeVec2)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
export const polygonArea=(p:Polygon)=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;

function halfPlane(polygon:Polygon,a:RuntimeVec2,b:RuntimeVec2,inside:boolean):Polygon {
  const result:Polygon=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],pc=cross(a,b,p),qc=cross(a,b,q);
    const pin=inside?pc>=-EPS:pc<=EPS,qin=inside?qc>=-EPS:qc<=EPS;
    if(pin)result.push(p);
    if(pin!==qin){const t=pc/(pc-qc);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
  }
  return result;
}

/** Subtract the union of compiler-owned triangles from a convex footprint.
 * Unlike summed intersection areas, overlapping supports cannot hide a hole. */
export function footprintSupported(footprint:Polygon,triangles:Polygon[]):boolean {
  let remaining:Polygon[]=[footprint];
  const tolerance=Math.max(EPS,polygonArea(footprint)*1e-9);
  for(const raw of triangles){
    const triangle=cross(raw[0],raw[1],raw[2])<0?[...raw].reverse():raw;
    const next:Polygon[]=[];
    for(const fragment of remaining){
      let inside=fragment;
      for(let i=0;i<3&&inside.length;i++){
        const a=triangle[i],b=triangle[(i+1)%3],outside=halfPlane(inside,a,b,false);
        if(polygonArea(outside)>tolerance)next.push(outside);
        inside=halfPlane(inside,a,b,true);
      }
    }
    remaining=next;if(!remaining.length)return true;
  }
  return remaining.reduce((area,p)=>area+polygonArea(p),0)<=tolerance;
}

export function furnitureFootprint(item:RuntimeFurnitureEntity):Polygon {
  const c=Math.cos(item.yawClockwiseRadians),s=Math.sin(item.yawClockwiseRadians);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[item.position[0]+c*x*item.size[0]/2-s*y*item.size[2]/2,item.position[2]+s*x*item.size[0]/2+c*y*item.size[2]/2]);
}

export function validateFurnitureSupport(scene:Plan2WorldRuntimeSceneV1):void {
  const supports=new Map<string,Polygon[]>();
  for(const floor of scene.floors){
    const owners=new Set(floor.rooms.map(room=>room.id)),triangles:Polygon[]=[];
    for(const collider of scene.colliders){
      if(collider.kind!=='triangle-mesh'||collider.floorId!==floor.id||!owners.has(collider.ownerId))continue;
      for(let i=0;i<collider.indices.length;i+=3){
        const vertices=collider.indices.slice(i,i+3).map(index=>collider.vertices[index]);
        if(vertices.every(p=>Math.abs(p[1]-floor.elevation)<1e-7))triangles.push(vertices.map(p=>[p[0],p[2]]));
      }
    }
    supports.set(floor.id,triangles);
  }
  for(const item of scene.entities){
    if(item.kind!=='furniture'||item.movement.kind!=='floor'||item.size[0]<=0||item.size[2]<=0)continue;
    if(!footprintSupported(furnitureFootprint(item),supports.get(item.floorId)??[]))throw new Error(`Furniture "${item.id}" is not fully supported by floor "${item.floorId}". Keep its entire footprint clear of floor holes and outside edges.`);
  }
}
