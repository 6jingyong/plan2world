import type { Floor } from '../models/types';
import { buildBareHouse, type SourceWallTraceV1 } from './bareHouse';
import { draftToProject, type DraftPoint } from './draft';
import { assemblePlan2WorldDraftWithReview, type ReconstructionAssemblyContext, type SourceAnnotationV1 } from './reconstructionAssembly';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { buildFloorClearance, DEFAULT_CLEARANCE_RADIUS_CM, hasClearanceAlongSegment, resolveClearancePoint } from '$lib/utils/floorClearance';
import { wallPointAt } from '$lib/utils/wallPath';

import { compileDoorGeometry } from '$lib/runtime/compileRuntimeScene';
import { reviewDoorGeometry, unavailableDoorGeometryReview } from '$lib/runtime/doorGeometryReview';
import { wallPathProfile } from '$lib/utils/wallPath';

const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const minus = (a: DraftPoint, b: DraftPoint) => ({ x: a.x - b.x, y: a.y - b.y });

/** Evaluate rendered/collision geometry, not whether the source depicts masonry,
 * pipe chases or two structural walls. Source positions remain immutable. */
export function evaluateLogicalGeometry(trace: SourceWallTraceV1, annotation: SourceAnnotationV1,
  context: ReconstructionAssemblyContext, positions: DraftPoint[], sourceOrigins = trace.walls.map((_, i) => [i])) {
  const house = buildBareHouse(trace), assembled = assemblePlan2WorldDraftWithReview(house, annotation, context);
  const floor = draftToProject(assembled.draft, new Date(0)).floors[0];
  const scale = annotation.scaleEvidence, factor = scale.realLengthCm / distance(...scale.endpoints);
  const points = house.walls.flatMap(w => [w.start, w.end, ...(w.curvePoint ? [w.curvePoint] : [])]);
  const origin = { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)) };
  const convert = (p: DraftPoint) => ({ x: (p.x - origin.x) * factor, y: (p.y - origin.y) * factor });
  const use = evaluateNativeLogicalUse(floor, positions.map(convert));
  const intervals = assembled.openingReview.sourceIntervals;
  // Use actual fragments on each native host, including chain windows. Comparing
  // just aggregate source intervals misses a conflict on the second fragment.
  const apertureSpans = [...floor.doors, ...floor.windows].map(o => {
    const wall = floor.walls.find(w => w.id === o.wallId)!;
    const path = wallPathProfile(wall), center = path.distanceAt(o.position);
    return { id: o.id, wallId: o.wallId, low: center-o.width/2, high: center+o.width/2, length: path.length };
  });
  const overlapPairs = apertureSpans.flatMap((a, i) => apertureSpans.slice(i+1).flatMap(b =>
    a.wallId === b.wallId && Math.min(a.high,b.high)-Math.max(a.low,b.low)>1e-6 ? [[a.id,b.id].sort().join('|')] : []));
  const validApertures = apertureSpans.every(a => a.low >= -1e-6 && a.high <= a.length+1e-6 && a.high > a.low);
  const doorReview = (() => {
    try { return validApertures && !overlapPairs.length ? reviewDoorGeometry(compileDoorGeometry(floor)) : unavailableDoorGeometryReview(); }
    catch { return unavailableDoorGeometryReview(); }
  })();
  const owners = new Map(Object.entries(house.sourceWallMap).flatMap(([source, ids]) =>
    ids.map(id => [id, sourceOrigins[Number(source.slice(1))-1] ?? []] as const)));
  const doorConflicts = doorReview.findings.flatMap(f => f.blockerIds.flatMap(id =>
    (owners.has(id) ? owners.get(id)!.map(i => `source-wall-${i}`) : [`door-${id}`])
      .map(owner => `${f.openingId}:${f.code}:${owner}`))).sort();
  return { house, floor, metrics: { closed: use.closed, blocked: use.blocked, sameRegion: use.sameRegion, reachable: use.reachable,
    clearDoorIds: use.clearDoorIds, entrances: use.entrances,
    openings: intervals.map(i => ({ id: i.id as string, kind: i.kind as string, widthPx: i.widthPx as number })),
    overlappingApertures: overlapPairs.length > 0, overlapPairs,
    doorCheckStatus: doorReview.status, doorConflicts, regionCount: use.regionCount } };
}

/** Read-only native enclosure/use checks. Positive direct-clearance/door-link
 * evidence is preserved; an unproven path is not a missing-door verdict. */
export function evaluateNativeLogicalUse(floor: Floor, positions: DraftPoint[]) {
  const analysis = analyzeFloor(floor);
  const world = buildFloorClearance({ ...floor, furniture: [] });
  const regions = positions.map(p => analysis.rooms.flatMap((room, i) => pointInPolygon(p, analysis.polygons.get(room.id) ?? [])
    && !(analysis.holes.get(room.id) ?? []).some(h => pointInPolygon(p, h)) ? [i] : []));
  const blocked = positions.map(p => distance(p, resolveClearancePoint(p, world, .01)) > .001);
  const adjacency = analysis.rooms.map(() => new Set<number>()), doorRegions = new Set<number>(), clearDoorIds: string[] = [];
  const doorwaySides: { point: DraftPoint; regions: number[] }[] = [];
  for (const door of floor.doors) {
    const host = floor.walls.find(w => w.id === door.wallId)!;
    const center = wallPointAt(host, door.position), v = minus(host.end, host.start), length = distance(host.start, host.end);
    const offset = host.thickness / 2 + DEFAULT_CLEARANCE_RADIUS_CM + 1;
    const a = { x: center.x - v.y / length * offset, y: center.y + v.x / length * offset };
    const b = { x: center.x + v.y / length * offset, y: center.y - v.x / length * offset };
    if (door.width < DEFAULT_CLEARANCE_RADIUS_CM * 2 || !hasClearanceAlongSegment(a, b, world)) continue;
    clearDoorIds.push(door.id);
    const owners = analysis.rooms.flatMap((r, i) => r.walls.includes(host.id) ? [i] : []);
    for (const point of [a,b]) doorwaySides.push({ point, regions: owners.filter(i =>
      pointInPolygon(point, analysis.polygons.get(analysis.rooms[i].id) ?? [])
      && !(analysis.holes.get(analysis.rooms[i].id) ?? []).some(h => pointInPolygon(point,h))) });
    for (const i of owners) { doorRegions.add(i); for (const j of owners) adjacency[i].add(j); }
  }
  const connected = (a: number[], b: number[]) => {
    const seen = new Set(a), queue = [...a];
    for (let i = 0; i < queue.length; i++) for (const next of adjacency[queue[i]]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    return b.some(i => seen.has(i));
  };
  const sameRegion = regions.map(a => regions.map(b => a.some(i => b.includes(i))));
  // Sharing a derived face is not proof that a capsule can fit through a tiny
  // unclosed endpoint gap. Protect actual direct clearance or explicit door
  // links between distinct faces, rather than that false topology shortcut.
  const reachable = regions.map((a, i) => regions.map((b, j) =>
    a.some(r => b.includes(r)) ? hasClearanceAlongSegment(positions[i], positions[j], world) : connected(a, b)));
  return { closed: regions.map(r => r.length > 0), blocked, sameRegion, reachable, clearDoorIds,
    entrances: regions.map((r,i) => doorwaySides.some(side => side.regions.length > 0 &&
      (r.some(id => side.regions.includes(id)) ? hasClearanceAlongSegment(positions[i],side.point,world) : connected(r,side.regions)))),
    regionCount: analysis.rooms.length };
}

type Metrics = ReturnType<typeof evaluateLogicalGeometry>['metrics'];
export function preservesLogicalGeometry(before: Metrics, after: Metrics, allowNewSeparation = false) {
  if (after.overlappingApertures && !before.overlappingApertures) return 'overlapping-openings';
  if (after.overlapPairs.some(pair => !before.overlapPairs.includes(pair))) return 'overlapping-openings';
  if (before.clearDoorIds.some(id => !after.clearDoorIds.includes(id))) return 'existing-door-clearance-lost';
  for (const o of before.openings) if (!after.openings.some(n => n.id === o.id && n.kind === o.kind && Math.abs(n.widthPx - o.widthPx) <= 1e-5)) return 'existing-opening-lost-or-resized';
  if (before.doorCheckStatus !== 'checked' || after.doorCheckStatus !== 'checked') return 'door-geometry-check-incomplete';
  if (after.doorConflicts.some(key => !before.doorConflicts.includes(key))) return 'new-door-geometry-conflict';
  return preservesLogicalUse(before, after, allowNewSeparation);
}

export type LogicalUseMetrics = ReturnType<typeof evaluateNativeLogicalUse>;
export function preservesLogicalUse(before: Pick<LogicalUseMetrics, 'closed'|'blocked'|'sameRegion'|'reachable'|'entrances'>,
  after: Pick<LogicalUseMetrics, 'closed'|'blocked'|'sameRegion'|'reachable'|'entrances'>, allowNewSeparation = false) {
  for (let i = 0; i < before.closed.length; i++) {
    if (before.closed[i] && !after.closed[i]) return 'existing-enclosure-lost';
    if (!before.blocked[i] && after.blocked[i]) return 'furniture-or-zone-seed-covered';
    if (before.entrances[i] && !after.entrances[i]) return 'existing-entrance-clearance-lost';
    for (let j = 0; j < i; j++) {
      if (before.closed[i] && before.closed[j] && (allowNewSeparation ? !before.sameRegion[i][j] && after.sameRegion[i][j] : before.sameRegion[i][j] !== after.sameRegion[i][j])) return 'functional-separation-changed';
      if (before.reachable[i][j] && !after.reachable[i][j]) return 'existing-traversal-lost';
    }
  }
  return undefined;
}

