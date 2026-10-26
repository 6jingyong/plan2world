import type { Floor, Room, FurnitureItem, FurnitureLightSettings, Point } from '../models/types';
import { analyzeFloor, type FloorAnalysis } from './floorAnalysis';
import { roomCeilingHeight } from './wallProfiles';
import { getFurnitureSize } from './furnitureCatalog';
import { pointInPolygon } from './hitTesting';

export const needsCeilingMount = (id: string) => ['ceiling_light', 'chandelier', 'recessed_light', 'pendant_light'].includes(id);
export function ceilingLightProfile(id: string) {
  if (!needsCeilingMount(id)) return null;
  return { kind: id === 'recessed_light' ? 'spot' as const : 'omni' as const,
    range: id === 'chandelier' ? 7 : 5, spotAngleDegrees: 48,
    defaults: { enabled: true, lumens: id === 'recessed_light' ? 500 : id === 'chandelier' ? 1800 : 1100,
      temperatureKelvin: id === 'chandelier' || id === 'pendant_light' ? 2700 : 4000 } satisfies FurnitureLightSettings };
}
export function nativeRoomId(floor: Floor, room: Room): string {
  return floor.rooms.some(saved => saved.id === room.id) ? room.id :
    `room:${encodeURIComponent(floor.id)}:${[...room.walls].sort().map(encodeURIComponent).join(',')}`;
}
export function nativeCeilingHeight(floor: Floor, room: Room) {
  return room.floorOpening || room.roomType === 'outdoor' || room.boundary ? undefined : roomCeilingHeight(room.walls, floor.walls);
}
export function ceilingHosts(floor: Floor, analysis: FloorAnalysis = analyzeFloor(floor)) {
  return analysis.geometry.flatMap(({room, polygon}) => {
    const height = nativeCeilingHeight(floor, room);
    return height === undefined ? [] : [{ id: nativeRoomId(floor, room), wallIds: [...new Set(room.walls)].sort(), height, polygon, holes: analysis.holes.get(room.id) ?? [] }];
  });
}

/** Exact footprint containment; no corner-only acceptance across apertures or
 * concave boundaries. Height comes from the same native ceiling as the compiler. */
export function furnitureCeilingFrame(floor: Floor, item: FurnitureItem, analysis?: FloorAnalysis) {
  if (!item.ceilingMount) throw new Error('Choose an authored ceiling for this light.');
  if (item.wallMount) throw new Error('Furniture cannot attach to both a wall and ceiling.');
  const key = JSON.stringify([...item.ceilingMount.wallIds].sort());
  const host = ceilingHosts(floor, analysis).find(h => JSON.stringify(h.wallIds) === key);
  if (!host) throw new Error('This ceiling is missing, open, outdoors or non-horizontal. Choose a supported authored ceiling.');
  const size = getFurnitureSize(item);
  if (![size.width, size.depth, size.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Ceiling furniture needs positive effective dimensions.');
  if (size.height >= host.height) throw new Error('The light does not fit below this ceiling.');
  const angle = item.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const footprint = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => ({ x: item.position.x + c*x*size.width/2 - s*y*size.depth/2, y: item.position.y+s*x*size.width/2+c*y*size.depth/2 }));
  const inside = (p: Point) => pointInPolygon(p, host.polygon) && !host.holes.some(h => pointInPolygon(p,h));
  const cross = (a:Point,b:Point,p:Point) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  const cuts = (a:Point,b:Point,c:Point,d:Point) => cross(a,b,c)*cross(a,b,d)<-1e-7 && cross(c,d,a)*cross(c,d,b)<-1e-7;
  const boundaries = [host.polygon,...host.holes];
  if (![item.position,...footprint].every(inside) || host.holes.some(h => h.some(p => pointInPolygon(p,footprint))) ||
    footprint.some((a,i) => boundaries.some(r => r.some((p,j) => cuts(a,footprint[(i+1)%4],p,r[(j+1)%r.length]))))) {
    throw new Error('Ceiling furniture must stay fully beneath its chosen ceiling, clear of holes.');
  }
  return { ...host, size, bottom: host.height-size.height };
}

/** Deterministic colour projection; source temperature/luminous flux stays native. */
export function lightColor(kelvin: number): [number,number,number] {
  const t=kelvin/100, clamp=(v:number)=>Math.max(0,Math.min(255,v))/255;
  return [clamp(t<=66?255:329.698727446*(t-60)**-.1332047592),
    clamp(t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492),
    clamp(t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307)];
}
