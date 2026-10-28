import type { RuntimeBoxCollider, RuntimeRoomSurface, RuntimeVec2 } from './types';

type P = RuntimeVec2;
const sub = (a:P,b:P):P => [a[0]-b[0],a[1]-b[1]];
const cross = (a:P,b:P) => a[0]*b[1]-a[1]*b[0];
const dot = (a:P,b:P) => a[0]*b[0]+a[1]*b[1];
const lerp = (a:P,b:P,t:number):P => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function inside(p:P,ring:P[]) {
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
/** Derive guards only from the union of accepted native floor surfaces. Split
 * crossings and collinear overlaps before testing both sides: adjoining and
 * overlapping floors never acquire an internal barrier. No outline hull, wall,
 * inferred ground or architectural evidence is written back to the Project.
 * Explicit slab holes remain apertures, not new safety walls. */
export function floorPerimeter(rooms:RuntimeRoomSurface[],floorId:string,elevation:number):RuntimeBoxCollider[] {
  const edges=rooms.flatMap(room=>room.polygon.map((a,i)=>({a,b:room.polygon[(i+1)%room.polygon.length],ownerId:room.id})));
  const rings=rooms.flatMap(room=>[room.polygon,...room.holes]);
  const covered=(p:P)=>rooms.some(r=>inside(p,r.polygon)&&!r.holes.some(h=>inside(p,h)));
  const result:RuntimeBoxCollider[]=[],seen=new Set<string>();
  for(const edge of edges) {
    const d=sub(edge.b,edge.a),length=Math.hypot(...d);if(length<1e-8)continue;
    const cuts=[0,1];
    for(const ring of rings)for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],v=sub(b,a),w=sub(a,edge.a),den=cross(d,v);
      if(Math.abs(den)>1e-12) {
        const t=cross(w,v)/den,u=cross(w,d)/den;
        if(t>0&&t<1&&u>=-1e-9&&u<=1+1e-9)cuts.push(t);
      }else if(Math.abs(cross(w,d))<1e-9*length) {
        for(const p of [a,b]) {const t=dot(sub(p,edge.a),d)/(length*length);if(t>0&&t<1)cuts.push(t);}
      }
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++) {
      const a=lerp(edge.a,edge.b,cuts[i-1]),b=lerp(edge.a,edge.b,cuts[i]);
      const span=Math.hypot(...sub(b,a));if(span<1e-7)continue;
      const mid=lerp(a,b,.5),normal:P=[-d[1]/length,d[0]/length];
      const probe=Math.min(1e-5,span*.001);
      const left=covered([mid[0]+normal[0]*probe,mid[1]+normal[1]*probe]);
      const right=covered([mid[0]-normal[0]*probe,mid[1]-normal[1]*probe]);
      if(left===right)continue;
      const key=[a,b].map(p=>p.map(v=>v.toFixed(8)).join(',')).sort().join(':');if(seen.has(key))continue;seen.add(key);
      const outward=left?-1:1;
      // Put the full 2cm thickness outside the accepted floor edge.
      result.push({id:`perimeter:${floorId}:${key}`,ownerId:edge.ownerId,floorId,dynamic:false,kind:'box',purpose:'perimeter',
        center:[mid[0]+normal[0]*outward*.01,elevation+1.4,mid[1]+normal[1]*outward*.01],size:[span+.002,2.8,.02],yawClockwiseRadians:Math.atan2(d[1],d[0])});
    }
  }
  return result;
}
