import type { Door, Point, Project, Wall } from '../models/types';
import { getWallStartHeight, getWallEndHeight, getWallHeightAt } from '../models/types';
import { readProject } from '../utils/projectValidation';
import { splitWallGeometry } from '../utils/splitWallGeometry';
import { splitWallRoomReferences } from '../utils/splitWallRooms';
import { wallPathProfile, wallPathSpans } from '../utils/wallProfiles';
import { wallPointAt, wallTangentAt } from '../utils/wallPath';
import { projectOntoWall } from '../utils/wallProjection';
import { analyzeFloor } from '../utils/floorAnalysis';
import { getFurnitureSize } from '../utils/furnitureCatalog';
import { floorBoundaryProblem, polygonAreaCm2 } from '../utils/floorBoundary';

export type ArchitectureEditCommand = (
  | { type: 'wall-add'; floorId: string; start: Point; end: Point; thickness?: number; height?: number }
  | { type: 'wall-update'; floorId: string; id: string; start: Point; end: Point; thickness: number; height: number; keepJunctions?: boolean }
  | { type: 'wall-remove'; floorId: string; id: string }
  | { type: 'wall-split'; floorId: string; id: string; at: number }
  | { type: 'opening-add'; floorId: string; wallId: string; position: number; width: number; kind: 'door' | 'window'; doorType?: Door['type']; material?: Door['material']; windowType?: import('../models/types').Window['type']; height?: number; sillHeight?: number }
  | { type: 'opening-update'; floorId: string; id: string; wallId: string; position: number; width: number; height: number; sillHeight?:number; doorType?: Door['type']; swingDirection?: Door['swingDirection']; flipSide?: boolean }
  | { type: 'opening-remove'; floorId: string; id: string }
  | { type: 'set-entrance'; floorId: string; id: string; side: 'left' | 'right' }
  | { type: 'resolve-architecture-issue'; floorId: string; id: string; resolved: boolean }
  | { type: 'floor-area-add'; floorId: string; points: Point[] }
  | { type: 'floor-area-update'; floorId: string; id: string; points: Point[] }
  | { type: 'floor-area-remove'; floorId: string; id: string }
) & { confirmWallEdit?: boolean };

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const point = (p: Point) => {
  if (!p || ![p.x, p.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000)) throw new Error('Use finite plan coordinates in centimetres.');
  return { x: p.x, y: p.y };
};
const positive = (n: number) => { if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new Error('Use a positive dimension in centimetres.'); return n; };

/** Explicit human authoring. Original reconstruction evidence is never edited.
 * Every candidate is a canonical Project; invalid runtime geometry may remain
 * editable in the correction view, while the normal runtime compiler stays strict. */
export function applyArchitectureEditCommand(input: unknown, command: ArchitectureEditCommand, now = new Date()) {
  const project = readProject(input), floor = project.floors.find(f => f.id === command.floorId);
  if (!floor) throw new Error('Choose a floor in this Project.');
  const ids = new Set(project.floors.flatMap(f => Object.values(f).flatMap(v => Array.isArray(v) ? v.flatMap(x => x && typeof x.id === 'string' ? [x.id] : []) : [])));
  const id = (prefix: string) => { let n = 1; while (ids.has(`${prefix}-${n}`)) n++; const value = `${prefix}-${n}`; ids.add(value); return value; };
  const selected = 'id' in command ? command.id : null;
  const oldRooms = floor.rooms;
  const oldWalls = new Map(floor.walls.map(w => [w.id, structuredClone(w)]));
  let selectedId: string | null = selected;
  if (command.type.startsWith('floor-area-')) {
    const c = command as Extract<ArchitectureEditCommand, { type: 'floor-area-add' | 'floor-area-update' | 'floor-area-remove' }>;
    const existing = 'id' in c ? floor.rooms.find(r => r.id === c.id && r.boundary && !r.floorOpening) : undefined;
    if (c.type !== 'floor-area-add' && !existing) throw new Error('Choose an explicitly authored ground area.');
    if (c.type === 'floor-area-update' && existing?.boundary?.some(p => 'wallId' in p || p.curvePoint)) throw new Error('Keep this ground\'s live wall/curve boundary. Use a new polygon area for paving.');
    if (c.type === 'floor-area-remove') {
      floor.rooms = floor.rooms.filter(r => r !== existing); selectedId = null;
    } else {
      if (!Array.isArray(c.points) || c.points.length < 3 || c.points.length > 256) throw new Error('Ground needs 3–256 boundary corners.');
      const points = c.points.map(point), boundary = points.map(point => ({ point }));
      if (floorBoundaryProblem(boundary, floor.walls)) throw new Error('Ground needs a non-crossing boundary with a real area.');
      selectedId = existing?.id ?? id('edited-ground');
      const room = { ...(existing ?? { id: selectedId, name: 'Paved ground', floorTexture: 'concrete', roomType: 'outdoor' as const }), walls: [], boundary, area: polygonAreaCm2(points) / 10000 };
      if (existing) Object.assign(existing, room); else floor.rooms.push(room);
    }
  } else if (command.type === 'wall-add') {
    const start = point(command.start), end = point(command.end);
    if (same(start, end)) throw new Error('A wall needs two different endpoints.');
    selectedId = id('edited-wall');
    floor.walls.push({ id: selectedId, start, end, thickness: positive(command.thickness ?? 15), height: positive(command.height ?? 280), color: '#444444' });
  } else if (command.type.startsWith('wall-')) {
    const c = command as Extract<ArchitectureEditCommand, { id: string }>, wall = floor.walls.find(w => w.id === c.id);
    if (!wall) throw new Error('Choose an existing wall segment.');
    if (command.type === 'wall-update') {
      const start = point(command.start), end = point(command.end);
      const oldHeight = wall.height, dx = start.x - wall.start.x, dy = start.y - wall.start.y;
      if (same(start, end)) throw new Error('A wall needs two different endpoints.');
      if (command.keepJunctions !== false) for (const adjacent of floor.walls) {
        if (adjacent.id === wall.id) continue;
        for (const key of ['start', 'end'] as const) {
          if (same(adjacent[key], wall.start)) adjacent[key] = { ...start };
          else if (same(adjacent[key], wall.end)) adjacent[key] = { ...end };
        }
        if (same(adjacent.start, adjacent.end)) throw new Error('This move collapses an adjoining wall.');
      }
      if (wall.curvePoint && end.x - wall.end.x === dx && end.y - wall.end.y === dy) wall.curvePoint = { x: wall.curvePoint.x + dx, y: wall.curvePoint.y + dy };
      Object.assign(wall, { start, end, thickness: positive(command.thickness), height: positive(command.height) });
      // A deliberate uniform height replaces endpoint taper only on this wall.
      if (wall.height !== oldHeight) wall.startHeight = wall.endHeight = wall.height;
    } else if (command.type === 'wall-remove') {
      if ([...floor.doors, ...floor.windows].some(o => o.wallId === wall.id)
        || floor.furniture.some(f => f.wallMount?.wallId === wall.id || f.ceilingMount?.wallIds.includes(wall.id))
        || floor.rooms.some(r => r.boundary?.some(p => 'wallId' in p && p.wallId === wall.id))) {
        throw new Error('Remove or rehost attached openings, mounted items and explicit floor boundaries before deleting this wall.');
      }
      floor.walls = floor.walls.filter(w => w.id !== wall.id);
      floor.rooms.forEach(r => r.walls = r.walls.filter(w => w !== wall.id));
      floor.groups.forEach(g => g.elementIds = g.elementIds.filter(x => x !== wall.id));
      floor.groups = floor.groups.filter(g => g.elementIds.length >= 2); selectedId = null;
    } else if (command.type === 'wall-split') {
      const t = command.at;
      if (!Number.isFinite(t) || t <= .001 || t >= .999) throw new Error('Split inside the wall, away from its endpoints.');
      const geometry = splitWallGeometry(wall, t), first = { ...wall, ...geometry.first }, second = { ...wall, ...geometry.second, id: id('edited-wall') };
      const profiles = [wallPathProfile(first), wallPathProfile(second)];
      for (const o of [...floor.doors, ...floor.windows].filter(o => o.wallId === wall.id)) {
        const clearance = o.position <= t ? profiles[0].length - profiles[0].distanceAt(o.position / t) : profiles[1].distanceAt((o.position - t) / (1 - t));
        if (clearance < o.width / 2 - 1e-7) throw new Error('Choose a split outside the door or window opening.');
      }
      const roomReferences = splitWallRoomReferences(floor, wall, t, second.id);
      for (const item of floor.furniture) {
        if (item.wallMount?.wallId === wall.id) {
          const projection = projectOntoWall(item.position, wall);
          if (!projection) throw new Error('This mounted item cannot be rehosted.');
          const clearance = projection.position <= t ? profiles[0].length - profiles[0].distanceAt(projection.position / t) : profiles[1].distanceAt((projection.position - t) / (1 - t));
          if (clearance < getFurnitureSize(item).width / 2 - 1e-7) throw new Error('Choose a split outside the mounted item footprint.');
          if (projection.position > t) item.wallMount.wallId = second.id;
        }
        if (item.ceilingMount?.wallIds.includes(wall.id)) item.ceilingMount.wallIds = item.ceilingMount.wallIds.flatMap(w => w === wall.id ? [wall.id, second.id] : [w]);
      }
      for (const room of floor.rooms) {
        room.walls = roomReferences.get(room.id) ?? room.walls;
        if (room.boundary) room.boundary = room.boundary.flatMap(p => 'wallId' in p && p.wallId === wall.id
          ? p.reverse ? [{ wallId: second.id, reverse: true }, p] : [p, { wallId: second.id }] : [p]);
      }
      floor.groups.forEach(g => g.elementIds = g.elementIds.flatMap(x => x === wall.id ? [wall.id, second.id] : [x]));
      for (const o of [...floor.doors, ...floor.windows].filter(o => o.wallId === wall.id)) {
        if (o.position > t) { o.wallId = second.id; o.position = (o.position - t) / (1 - t); } else o.position /= t;
      }
      const middle = getWallHeightAt(wall, t), a = getWallStartHeight(wall), b = getWallEndHeight(wall);
      Object.assign(first, { height: Math.max(a, middle), startHeight: a, endHeight: middle });
      Object.assign(second, { height: Math.max(middle, b), startHeight: middle, endHeight: b });
      Object.assign(wall, first); floor.walls.push(second); selectedId = second.id;
    }
  } else if (command.type === 'opening-add') {
    if (!floor.walls.some(w => w.id === command.wallId)) throw new Error('Choose the wall that carries this opening.');
    selectedId = id('edited-opening');
    const base = { id: selectedId, wallId: command.wallId, position: command.position, width: positive(command.width) };
    if (command.kind === 'door') floor.doors.push({ ...base, type: command.doorType ?? 'single', height: positive(command.height ?? 210), material: command.material ?? 'wood', swingDirection: 'left', flipSide: false });
    else if (command.kind === 'window') floor.windows.push({ ...base, type: command.windowType ?? 'standard', height: positive(command.height ?? 120), sillHeight: command.sillHeight ?? 90 });
    else throw new Error('Choose a door or window opening.');
  } else if (command.type === 'opening-update' || command.type === 'opening-remove') {
    const opening = [...floor.doors, ...floor.windows].find(o => o.id === command.id);
    if (!opening) throw new Error('Choose an existing opening.');
    if (command.type === 'opening-remove') {
      floor.doors = floor.doors.filter(o => o.id !== command.id); floor.windows = floor.windows.filter(o => o.id !== command.id);
      if (floor.entrance?.doorId === command.id) delete floor.entrance;
      selectedId = null;
    } else {
      Object.assign(opening, { wallId: command.wallId, position: command.position, width: positive(command.width), height: positive(command.height) });
      if ('sillHeight' in opening && command.sillHeight !== undefined) opening.sillHeight = command.sillHeight;
      if ('swingDirection' in opening) {
        if (command.doorType && command.doorType !== opening.type) { opening.type = command.doorType; delete opening.leafConfiguration; }
        if (command.swingDirection !== undefined) opening.swingDirection = command.swingDirection;
        if (command.flipSide !== undefined) opening.flipSide = command.flipSide;
      }
    }
  } else if (command.type === 'set-entrance') {
    if (!floor.doors.some(d => d.id === command.id && d.type !== 'opening')) throw new Error('Choose an existing door as the main entrance.');
    for (const f of project.floors) { delete f.entrance; delete f.walkthroughStart; }
    floor.entrance = { doorId: command.id, side: command.side };
  } else if (command.type === 'resolve-architecture-issue') {
    const issue = project.architectureReview?.issues.find(i => i.id === command.id && i.floorId === floor.id);
    if (!issue || typeof command.resolved !== 'boolean') throw new Error('Choose a source issue to mark as reviewed.');
    issue.resolved = command.resolved;
  } else throw new Error('Unsupported architecture edit.');
  if (command.type.startsWith('wall-')) {
    const changed = floor.walls.filter(w => !oldWalls.has(w.id) || JSON.stringify(w) !== JSON.stringify(oldWalls.get(w.id)));
    const removed = [...oldWalls.values()].filter(w => !floor.walls.some(v => v.id === w.id));
    if ([...changed, ...removed].some(w => oldWalls.get(w.id)?.authorModified) && !command.confirmWallEdit) throw new Error('This wall was manually corrected and is protected. Explicitly enable correction of marked walls first.');
    changed.forEach(w => w.authorModified = true);
  }
  if (['wall-add', 'wall-update', 'wall-remove', 'wall-split'].includes(command.type)) floor.rooms = analyzeFloor(floor, oldRooms).rooms;
  project.updatedAt = now;
  return { project: readProject(project), selectedId, updateKind: 'architecture' as const };
}

/** Read-only native editor projection. Paths/IDs come from the shared core,
 * never from interpreting the presentation meshes in Godot. */
export function nativeArchitectureEditor(project: Project) {
  return { floors: project.floors.map(floor => ({ id: floor.id, name: floor.name,
    background: floor.backgroundImage ?? null,
    walls: floor.walls.map(w => {
      const points = wallPathSpans(w).flatMap((s, i) => i ? [s.end] : [s.start, s.end]);
      return { ...w, points: points.length ? points : [w.start, w.end] };
    }),
    openings: [...floor.doors, ...floor.windows].map(o => {
      const wall = floor.walls.find(w => w.id === o.wallId)!, tangent = wallTangentAt(wall, o.position);
      return { ...o, kind: floor.doors.includes(o as Door) ? 'door' : 'window', center: wallPointAt(wall, o.position), inwardLeft: { x: -tangent.y, y: tangent.x } };
    }),
    furniture: floor.furniture.map(f => ({ id: f.id, position: f.position })),
    groundAreas: analyzeFloor(floor).geometry.filter(({ room }) => room.boundary && !room.floorOpening).map(({ room, polygon }) => ({ id: room.id, name: room.name, points: polygon, editable: room.boundary!.every(p => 'point' in p && !p.curvePoint) })),
    entrance: floor.entrance ?? null,
    walkthroughStart: floor.walkthroughStart ?? null,
    issues: project.architectureReview?.issues.filter(i => i.floorId === floor.id) ?? [],
  })) };
}
