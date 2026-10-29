import { buildBareHouse, type SourceWallTraceV1 } from './bareHouse';
import { draftToProject, type DraftPoint } from './draft';
import { assemblePlan2WorldDraftWithReview, type ReconstructionAssemblyContext, type SourceAnnotationV1 } from './reconstructionAssembly';
import type { SourceFunctionalZone } from './functionalZones';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { buildFloorClearance, DEFAULT_CLEARANCE_RADIUS_CM, hasClearanceAlongSegment, resolveClearancePoint } from '$lib/utils/floorClearance';
import { wallPointAt } from '$lib/utils/wallPath';
import { reviewWallEnvelopeUse, WALL_ENVELOPE_USE_POLICY, type WallEnvelopeUse } from './wallEnvelopeUse';

export const LOGICAL_WALL_POLICY = 'close-parallel-logical-envelope-v1' as const;
type Wall = SourceWallTraceV1['walls'][number];
const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a: DraftPoint, b: DraftPoint) => a.x * b.x + a.y * b.y;
const minus = (a: DraftPoint, b: DraftPoint) => ({ x: a.x - b.x, y: a.y - b.y });

/** Evaluate rendered/collision geometry, not whether the source depicts masonry,
 * pipe chases or two structural walls. Source positions remain immutable. */
function logicalState(trace: SourceWallTraceV1, annotation: SourceAnnotationV1,
  context: ReconstructionAssemblyContext, positions: DraftPoint[]) {
  const house = buildBareHouse(trace), assembled = assemblePlan2WorldDraftWithReview(house, annotation, context);
  const floor = draftToProject(assembled.draft, new Date(0)).floors[0], analysis = analyzeFloor(floor);
  const scale = annotation.scaleEvidence, factor = scale.realLengthCm / distance(...scale.endpoints);
  const points = house.walls.flatMap(w => [w.start, w.end, ...(w.curvePoint ? [w.curvePoint] : [])]);
  const origin = { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)) };
  const convert = (p: DraftPoint) => ({ x: (p.x - origin.x) * factor, y: (p.y - origin.y) * factor });
  const world = buildFloorClearance({ ...floor, furniture: [] });
  const regions = positions.map(p => analysis.rooms.flatMap((room, i) => pointInPolygon(convert(p), analysis.polygons.get(room.id) ?? [])
    && !(analysis.holes.get(room.id) ?? []).some(h => pointInPolygon(convert(p), h)) ? [i] : []));
  const blocked = positions.map(p => distance(convert(p), resolveClearancePoint(convert(p), world, .01)) > .001);
  const adjacency = analysis.rooms.map(() => new Set<number>()), doorRegions = new Set<number>(), clearDoorIds: string[] = [];
  for (const door of floor.doors) {
    const host = floor.walls.find(w => w.id === door.wallId)!;
    const center = wallPointAt(host, door.position), v = minus(host.end, host.start), length = distance(host.start, host.end);
    const offset = host.thickness / 2 + DEFAULT_CLEARANCE_RADIUS_CM + 1;
    const a = { x: center.x - v.y / length * offset, y: center.y + v.x / length * offset };
    const b = { x: center.x + v.y / length * offset, y: center.y - v.x / length * offset };
    if (door.width < DEFAULT_CLEARANCE_RADIUS_CM * 2 || !hasClearanceAlongSegment(a, b, world)) continue;
    clearDoorIds.push(door.id);
    const owners = analysis.rooms.flatMap((r, i) => r.walls.includes(host.id) ? [i] : []);
    for (const i of owners) { doorRegions.add(i); for (const j of owners) adjacency[i].add(j); }
  }
  const connected = (a: number[], b: number[]) => {
    const seen = new Set(a), queue = [...a];
    for (let i = 0; i < queue.length; i++) for (const next of adjacency[queue[i]]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    return b.some(i => seen.has(i));
  };
  const sameRegion = regions.map(a => regions.map(b => a.some(i => b.includes(i))));
  const reachable = regions.map(a => regions.map(b => connected(a, b)));
  const intervals = assembled.openingReview.sourceIntervals;
  const overlaps = intervals.some((a, i) => intervals.slice(i + 1).some(b => {
    if (a.wallId !== b.wallId) return false;
    const wall = house.walls.find(w => w.id === a.wallId)!;
    const u = minus(wall.end, wall.start), length = distance(wall.start, wall.end);
    const along = (p: DraftPoint) => dot(minus(p, wall.start), u) / length;
    const aa = a.projectedEndpoints.map(along), bb = b.projectedEndpoints.map(along);
    return Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb)) > 1e-6;
  }));
  return { house, floor, metrics: { closed: regions.map(r => r.length > 0), blocked, sameRegion, reachable,
    clearDoorIds,
    entrances: regions.map(r => r.some(i => doorRegions.has(i))),
    openings: intervals.map(i => ({ id: i.id as string, kind: i.kind as string, widthPx: i.widthPx as number })),
    overlappingApertures: overlaps, regionCount: analysis.rooms.length } };
}

type Metrics = ReturnType<typeof logicalState>['metrics'];
function preserves(before: Metrics, after: Metrics) {
  if (after.overlappingApertures && !before.overlappingApertures) return 'overlapping-openings';
  if (before.clearDoorIds.some(id => !after.clearDoorIds.includes(id))) return 'existing-door-clearance-lost';
  for (const o of before.openings) if (!after.openings.some(n => n.id === o.id && n.kind === o.kind && Math.abs(n.widthPx - o.widthPx) <= 1e-5)) return 'existing-opening-lost-or-resized';
  for (let i = 0; i < before.closed.length; i++) {
    if (before.closed[i] && !after.closed[i]) return 'existing-enclosure-lost';
    if (!before.blocked[i] && after.blocked[i]) return 'furniture-or-zone-seed-covered';
    if (before.entrances[i] && !after.entrances[i]) return 'existing-entrance-clearance-lost';
    for (let j = 0; j < i; j++) {
      if (before.closed[i] && before.closed[j] && before.sameRegion[i][j] !== after.sameRegion[i][j]) return 'functional-separation-changed';
      if (before.reachable[i][j] && !after.reachable[i][j]) return 'existing-traversal-lost';
    }
  }
  return undefined;
}

function frame(w: Wall) {
  const length = distance(w.start, w.end), u = { x: (w.end.x - w.start.x) / length, y: (w.end.y - w.start.y) / length };
  const n = { x: -u.y, y: u.x };
  return { u, n, length, along: (p: DraftPoint) => dot(minus(p, w.start), u), across: (p: DraftPoint) => dot(minus(p, w.start), n),
    at: (t: number, d: number) => ({ x: w.start.x + u.x * t + n.x * d, y: w.start.y + u.y * t + n.y * d }) };
}

/** Compress close parallel runs into one effective solid wall. This is an
 * authoring normalization BEFORE the final freeze, not a source-fact verdict.
 * Nothing from the read-only raster/centerline diagnostics participates. */
export function abstractCloseParallelWalls(input: SourceWallTraceV1, observed: SourceAnnotationV1,
  context: ReconstructionAssemblyContext = {}, zones: SourceFunctionalZone[] = []) {
  const scale = observed.scaleEvidence, factor = scale.realLengthCm / distance(...scale.endpoints);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('Logical wall abstraction requires positive uniform scale.');
  const positions = [...(observed.furniture ?? []).map(f => f.position),
    ...zones.filter(z => z.decision === 'accept').map(z => z.position)];
  let trace = structuredClone(input), annotation = structuredClone(observed);
  let origins = input.walls.map((_, i) => [i]);
  const accepted: { sourceWallIndices: number[]; absorbedWallIndices: number[]; thicknessPx: number; projectedOpenings: { index: number; before: DraftPoint[]; after: DraftPoint[] }[]; before: Metrics; after: Metrics }[] = [];
  const trials: { sourceWallIndices: number[]; status: string; reason?: string; after?: Metrics; protectedUses?: WallEnvelopeUse[] }[] = [];
  // A 60cm baseline gap leaves <56cm of clear space with the current native
  // wall defaults. Never chain this bound across successive nearby pairs.
  const maxGap = Math.min(64, 60 / factor), groups: number[][] = [];
  const eligible = (w: Wall) => !w.curvePoint && (!w.boundaryType || w.boundaryType === 'solid');
  const parents = input.walls.map((_, i) => i);
  const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
  if (input.walls.length <= 512) for (let i = 0; i < input.walls.length; i++) for (let j = i + 1; j < input.walls.length; j++) {
    const a = input.walls[i], b = input.walls[j]; if (!eligible(a) || !eligible(b)) continue;
    const f = frame(a), offsets = [f.across(b.start), f.across(b.end)], ts = [f.along(b.start), f.along(b.end)].sort((a, b) => a - b);
    // Inner/outer runs can stop at opposite sides of an intersecting thick
    // wall. Bound that longitudinal mismatch by the same local width budget.
    const gap = Math.abs((offsets[0] + offsets[1]) / 2), tolerance = maxGap;
    if (gap <= 3 || gap > maxGap || Math.abs(offsets[0] - offsets[1]) > .5 || f.length < Math.max(24, gap * 6)) continue;
    if (Math.abs(ts[0]) > tolerance || Math.abs(ts[1] - f.length) > tolerance || ts[1] - ts[0] < f.length * .8) continue;
    parents[root(j)] = root(i);
  }
  const members = new Map<number, number[]>();
  input.walls.forEach((_, i) => { const r = root(i); members.set(r, [...(members.get(r) ?? []), i]); });
  groups.push(...[...members.values()].filter(g => g.length > 1));
  // Most observations contain no such pair. Avoid extra native analysis and
  // quadratic anchor relations on the normal no-candidate path.
  if (!groups.length || positions.length > 256) return {
    normalizationInput: trace, annotation, bareHouse: buildBareHouse(trace), sourceWallOrigins: origins,
    review: { policy: LOGICAL_WALL_POLICY, usagePolicy: WALL_ENVELOPE_USE_POLICY, llmCalls: 0, sourceFactsConfirmed: false, maxBaselineGapPx: maxGap, maxBaselineGapCm: 60,
      initialMetrics: null, finalMetrics: null, accepted, trials,
      budgetReached: input.walls.length > 512 || positions.length > 256, geometryChanged: false, normalizationInputIsProgramDerived: true,
      limitation: 'No eligible parallel group, or the bounded logical evaluation budget was exceeded. Source lines are retained.' },
  };
  let current = logicalState(trace, annotation, context, positions);
  const initialMetrics = current.metrics;
  for (const group of groups.slice(0, 24)) {
    try {
      const indices = group.map(i => origins.findIndex(o => o.includes(i)));
      if (indices.some(i => i < 0) || new Set(indices).size !== indices.length) continue;
      const ws = indices.map(i => trace.walls[i]), anchor = ws.reduce((a, b) => distance(a.start, a.end) >= distance(b.start, b.end) ? a : b), f = frame(anchor);
      const normal = ws.flatMap(w => [f.across(w.start), f.across(w.end)]), low = Math.min(...normal), high = Math.max(...normal);
      if (high - low > maxGap + 1e-6) { trials.push({ sourceWallIndices: group, status: 'total-envelope-exceeds-bound' }); continue; }
      const width = (i: number) => trace.walls[i].thicknessPx ?? current.floor.walls.find(w => (current.house.sourceWallMap[`w${i + 1}`] ?? []).includes(w.id))!.thickness / factor;
      const ordered = indices.map(i => ({ offset: (f.across(trace.walls[i].start) + f.across(trace.walls[i].end)) / 2, width: width(i) })).sort((a, b) => a.offset - b.offset);
      if (ordered.some((w, i) => i > 0 && (w.offset - ordered[i - 1].offset - (w.width + ordered[i - 1].width) / 2) * factor >= DEFAULT_CLEARANCE_RADIUS_CM * 2 - 1e-6)) {
        trials.push({ sourceWallIndices: group, status: 'player-width-strip-retained' }); continue;
      }
      const lower = Math.min(...indices.flatMap(i => [f.across(trace.walls[i].start), f.across(trace.walls[i].end)].map(d => d - width(i) / 2)));
      const upper = Math.max(...indices.flatMap(i => [f.across(trace.walls[i].start), f.across(trace.walls[i].end)].map(d => d + width(i) / 2)));
      const middle = (lower + upper) / 2, thicknessPx = upper - lower;
      const alongs = ws.flatMap(w => [f.along(w.start), f.along(w.end)]), from = Math.min(...alongs), to = Math.max(...alongs);
      const inBand = (p: DraftPoint) => f.across(p) >= low - 1e-6 && f.across(p) <= high + 1e-6 && f.along(p) >= from - 1e-6 && f.along(p) <= to + 1e-6;
      const protectedUses = reviewWallEnvelopeUse(annotation, zones, trace.doorGaps,
        { ...f, from, to, faces: ws.map(w => (f.across(w.start) + f.across(w.end)) / 2) });
      if (protectedUses.length) {
        const status = protectedUses.some(u => u.kind === 'passage') ? 'functional-passage-in-envelope'
          : protectedUses.some(u => u.kind === 'furniture') ? 'furnished-space-in-envelope'
          : protectedUses.some(u => u.kind === 'functional-zone') ? 'functional-zone-in-envelope' : 'observed-access-in-envelope';
        trials.push({ sourceWallIndices: group, status, protectedUses }); continue;
      }
      const next = structuredClone(trace), nextAnnotation = structuredClone(annotation), removed = new Set(indices.slice(1));
      const absorbed = [...group];
      for (let i = 0; i < next.walls.length; i++) {
        if (indices.includes(i)) continue;
        const w = next.walls[i], start = inBand(w.start), end = inBand(w.end);
        if (!start && !end) continue;
        if (w.curvePoint || w.boundaryType && w.boundaryType !== 'solid') throw new Error('Non-solid/legacy curved junction requires its existing geometry.');
        if (start && end) { removed.add(i); absorbed.push(...origins[i]); continue; }
        const endpoint = start ? 'start' : 'end', p = w[endpoint], other = w[start ? 'end' : 'start'];
        const d = minus(p, other), across = dot(d, f.n);
        if (Math.abs(across) < 1e-8) throw new Error('Parallel endpoint outside the common extent.');
        const t = (middle - f.across(p)) / across;
        const target = { x: p.x + d.x * t, y: p.y + d.y * t };
        if (distance(target, p) > thicknessPx + 3 || f.along(target) < from - 3 || f.along(target) > to + 3) throw new Error('Junction continuation exceeds the local envelope.');
        w[endpoint] = target;
      }
      next.walls[indices[0]] = { start: f.at(from, middle), end: f.at(to, middle), thicknessPx };
      const projectedOpenings: typeof accepted[number]['projectedOpenings'] = [];
      for (const [index, opening] of (nextAnnotation.openings ?? []).entries()) {
        const [a, b] = opening.endpoints, v = minus(b, a);
        if (!inBand(a) || !inBand(b) || Math.abs(dot(v, f.n)) > .5) continue;
        const before = structuredClone(opening.endpoints);
        opening.endpoints = opening.endpoints.map(p => f.at(f.along(p), middle)) as [DraftPoint, DraftPoint];
        projectedOpenings.push({ index, before, after: structuredClone(opening.endpoints) });
      }
      for (const gap of next.doorGaps ?? []) for (const endpoint of ['from', 'to'] as const) if (inBand(gap[endpoint])) gap[endpoint] = f.at(f.along(gap[endpoint]), middle);
      const nextOrigins = origins.map((o, i) => i === indices[0] ? [...new Set(absorbed)].sort((a, b) => a - b) : o).filter((_, i) => !removed.has(i));
      next.walls = next.walls.filter((_, i) => !removed.has(i));
      const state = logicalState(next, nextAnnotation, context, positions), reason = preserves(current.metrics, state.metrics);
      if (reason) { trials.push({ sourceWallIndices: group, status: 'logical-regression', reason, after: state.metrics }); continue; }
      accepted.push({ sourceWallIndices: group, absorbedWallIndices: [...new Set(absorbed)], thicknessPx, projectedOpenings, before: current.metrics, after: state.metrics });
      trace = next; annotation = nextAnnotation; origins = nextOrigins; current = state;
      trials.push({ sourceWallIndices: group, status: 'accepted-logical-envelope', after: state.metrics });
    } catch (error) { trials.push({ sourceWallIndices: group, status: 'invalid-trial', reason: String(error) }); }
  }
  return { normalizationInput: trace, annotation, bareHouse: current.house, sourceWallOrigins: origins, review: {
    policy: LOGICAL_WALL_POLICY, usagePolicy: WALL_ENVELOPE_USE_POLICY, llmCalls: 0, sourceFactsConfirmed: false, maxBaselineGapPx: maxGap, maxBaselineGapCm: 60,
    initialMetrics, finalMetrics: current.metrics, accepted, trials, budgetReached: groups.length > 24 || input.walls.length > 512,
    geometryChanged: accepted.length > 0, normalizationInputIsProgramDerived: true,
    limitation: 'Effective solid envelopes, not construction facts. Whole-image raster fitting remains disabled. Partial runs, broad gaps, changed functional separation, covered anchors and lost native doorway clearance are not accepted. Native doorway checks are not an engine walkthrough.' } };
}
