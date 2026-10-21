import type { DraftPoint } from './draft';
import { draftToProject } from './draft';
import { buildBareHouse, type BareHouseV1, type SourceWallTraceV1 } from './bareHouse';
import { assemblePlan2WorldDraftWithReview, type SourceAnnotationV1, type ReconstructionAssemblyContext } from './reconstructionAssembly';
import { evaluateClosure, reviewFurnitureClosureCandidates } from './furnitureGuidedClosure';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { floorBoundaryPolygon, floorBoundaryProblem, polygonAreaCm2 } from '$lib/utils/floorBoundary';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPathSpans, wallPointAt, wallPathProfile } from '$lib/utils/wallPath';
import { wallPathCoverage } from '$lib/utils/wallPathCoverage';

export const FUNCTIONAL_ZONE_POLICY = 'functional-zones-logical-closure-v1';
export type ZoneEdgeKind = 'wall' | 'window' | 'passage' | 'railing' | 'air' | 'unknown';
export interface SourceFunctionalZone {
  label: string; category: string; environment: 'indoor' | 'balcony' | 'outdoor'; position: DraftPoint;
  boundary: { point: DraftPoint; kind: ZoneEdgeKind; evidence: string; curvePoint?: DraftPoint }[];
  evidence: string; decision: 'accept' | 'uncertain' | 'reject'; decisionBasis: string;
  uncertainty?: string; sourceView?: string;
}
const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const keys = (o: Record<string, unknown>, allowed: string[], path: string) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${path} requires an object`);
  const extras = Object.keys(o).filter(k => !allowed.includes(k));
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
};
const text = (x: unknown, path: string): string => { if (typeof x !== 'string' || !x.trim()) throw new Error(`${path} requires text`); return x; };
const point = (x: any, path: string): DraftPoint => {
  keys(x, ['x', 'y'], path); if (![x.x, x.y].every(Number.isFinite)) throw new Error(`${path} requires finite source pixels`);
  return { x: x.x, y: x.y };
};
export function parseFunctionalZones(input: unknown): SourceFunctionalZone[] {
  if (!Array.isArray(input) || input.length > 128) throw new Error('functionalZones requires at most 128 observations');
  return input.map((z: any, index) => {
    const path = `functionalZones[${index}]`;
    keys(z, ['label', 'category', 'environment', 'position', 'boundary', 'evidence', 'decision', 'decisionBasis', 'uncertainty', 'sourceView'], path);
    if (!['accept', 'uncertain', 'reject'].includes(z.decision)) throw new Error(`${path}.decision is unsupported`);
    if (!['indoor', 'balcony', 'outdoor'].includes(z.environment)) throw new Error(`${path}.environment is unsupported`);
    if (!Array.isArray(z.boundary) || z.boundary.length < 3 || z.boundary.length > 128) throw new Error(`${path}.boundary requires 3–128 edge observations`);
    const boundary = z.boundary.map((b: any, i: number) => {
      keys(b, ['point', 'kind', 'evidence', 'curvePoint'], `${path}.boundary[${i}]`);
      if (!['wall', 'window', 'passage', 'railing', 'air', 'unknown'].includes(b.kind)) throw new Error(`${path}.boundary edge kind is unsupported`);
      return { point: point(b.point, path), kind: b.kind, evidence: text(b.evidence, path),
        ...(b.curvePoint === undefined ? {} : { curvePoint: point(b.curvePoint, path) }) };
    });
    const position = point(z.position, `${path}.position`);
    if (floorBoundaryProblem(boundary, []) || !pointInPolygon(position, floorBoundaryPolygon(boundary, []))) throw new Error(`${path} requires a simple source outline containing its seed`);
    if (boundary.some((b: any, i: number) => distance(b.point, boundary[(i + 1) % boundary.length].point) <= 1e-6)) throw new Error(`${path} contains a collapsed edge`);
    return { label: text(z.label, path), category: text(z.category, path), environment: z.environment, position, boundary,
      evidence: text(z.evidence, path), decision: z.decision, decisionBasis: text(z.decisionBasis, path),
      ...(z.uncertainty === undefined ? {} : { uncertainty: text(z.uncertainty, path) }),
      ...(z.sourceView === undefined ? {} : { sourceView: text(z.sourceView, path) }) };
  });
}

/** Continuous collinear coverage. Does not fit lines to raster or move observations. */
function edgeCoverage(start: DraftPoint, end: DraftPoint, trace: Pick<SourceWallTraceV1, 'walls'>, tolerance = 3) {
  const size = distance(start, end), dx = (end.x - start.x) / size, dy = (end.y - start.y) / size;
  const along = (p: DraftPoint) => (p.x - start.x) * dx + (p.y - start.y) * dy;
  const across = (p: DraftPoint) => Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx);
  const segments = trace.walls.flatMap((wall, wallIndex) => {
    if (wall.curvePoint) return [];
    const wl = distance(wall.start, wall.end);
    const alignment = Math.abs(((wall.end.x - wall.start.x) * dx + (wall.end.y - wall.start.y) * dy) / wl);
    if (alignment < Math.cos(Math.PI / 18)) return [];
    const low = Math.max(0, Math.min(along(wall.start), along(wall.end))), high = Math.min(size, Math.max(along(wall.start), along(wall.end)));
    const a = along(wall.start), b = along(wall.end);
    const at = (t: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * (t - a) / (b - a), y: wall.start.y + (wall.end.y - wall.start.y) * (t - a) / (b - a) });
    if (across(at(low)) > tolerance || across(at(high)) > tolerance) return [];
    return high - low > 1e-6 ? [{ low, high, wallIndex }] : [];
  }).sort((a, b) => a.low - b.low);
  const gaps: [number, number][] = []; let to = 0;
  for (const s of segments) { if (s.low > to + 1e-6) gaps.push([to, s.low]); to = Math.max(to, s.high); }
  if (to < size - 1e-6) gaps.push([to, size]);
  const at = (value: number) => ({ x: start.x + dx * value, y: start.y + dy * value });
  return { segments, gaps: gaps.map(([a, b]): { start: DraftPoint; end: DraftPoint; curvePoint?: DraftPoint } => ({ start: at(a), end: at(b) })) };
}

function state(house: BareHouseV1, annotation: SourceAnnotationV1, zones: SourceFunctionalZone[], context: ReconstructionAssemblyContext) {
  const draft = assemblePlan2WorldDraftWithReview(house, annotation, context).draft;
  const analysis = analyzeFloor(draftToProject(draft, new Date(0)).floors[0]);
  const ref = annotation.scaleEvidence, factor = ref.realLengthCm / distance(ref.endpoints[0], ref.endpoints[1]);
  const points = house.walls.flatMap(w => [w.start, w.end, ...(w.curvePoint ? [w.curvePoint] : [])]);
  const origin = { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)) };
  const convert = (p: DraftPoint) => ({ x: (p.x - origin.x) * factor, y: (p.y - origin.y) * factor });
  const assignments = zones.map((zone, index) => ({ index, zone, regionIndices: analysis.rooms.flatMap((room, ri) =>
    pointInPolygon(convert(zone.position), analysis.polygons.get(room.id) ?? []) && !(analysis.holes.get(room.id) ?? []).some(hole => pointInPolygon(convert(zone.position), hole)) ? [ri] : []) }));
  const regions = analysis.rooms.map((room, index) => ({ index, nativeWallIds: room.walls,
    zoneIndices: assignments.filter(a => a.regionIndices.includes(index)).map(a => a.index),
    areaPx2: (polygonAreaCm2(analysis.polygons.get(room.id) ?? []) - (analysis.holes.get(room.id) ?? []).reduce((s, h) => s + polygonAreaCm2(h), 0)) / factor ** 2 }));
  const zoneStates = assignments.map(a => {
    const region = a.regionIndices.length === 1 ? regions[a.regionIndices[0]] : undefined;
    const sourceArea = polygonAreaCm2(floorBoundaryPolygon(a.zone.boundary, []));
    const ratio = region ? region.areaPx2 / sourceArea : null;
    const nativeSpans = { walls: house.walls.flatMap(w => wallPathSpans(w).map(s => ({ start: s.start, end: s.end }))) };
    const unsupportedEdges = a.zone.boundary.flatMap((edge, ei) => {
      if (edge.kind === 'unknown') return [];
      const end = a.zone.boundary[(ei + 1) % a.zone.boundary.length].point;
      const spans = wallPathSpans({ start: edge.point, end, ...(edge.curvePoint ? { curvePoint: edge.curvePoint } : {}) });
      const missingPx = spans.reduce((sum, span) => sum + edgeCoverage(span.start, span.end, nativeSpans).gaps.reduce((s, g) => s + (distance(g.start, g.end) > 3 ? distance(g.start, g.end) : 0), 0), 0);
      return missingPx > 1e-6 ? [{ edge: ei, kind: edge.kind, missingPx }] : [];
    });
    const unknownEdgeCount = a.zone.boundary.filter(b => b.kind === 'unknown').length;
    const uniqueClosedRegion = !!region && region.zoneIndices.length === 1 && ratio! >= 0.25 && ratio! <= 4;
    const resolved = uniqueClosedRegion && !unsupportedEdges.length && unknownEdgeCount === 0;
    return { index: a.index, label: a.zone.label, category: a.zone.category, environment: a.zone.environment,
      sourcePosition: a.zone.position, regionIndices: a.regionIndices, areaRatio: ratio, resolved, uniqueClosedRegion, unsupportedEdges, unknownEdgeCount,
      status: !a.regionIndices.length ? 'unclosed' : a.regionIndices.length !== 1 ? 'overlapping-native-regions' : region!.zoneIndices.length > 1 ? 'merged-functional-zones'
        : !uniqueClosedRegion ? 'outline-area-conflict' : unknownEdgeCount ? 'unknown-boundary-construction' : unsupportedEdges.length ? 'unsupported-functional-boundary' : 'closed-and-separated' };
  });
  return { resolvedZoneCount: zoneStates.filter(z => z.resolved).length, closedZoneCount: zoneStates.filter(z => z.regionIndices.length === 1).length,
    uniqueClosedZoneCount: zoneStates.filter(z => z.uniqueClosedRegion).length,
    uncoveredBoundaryPx: zoneStates.reduce((s, z) => s + z.unsupportedEdges.reduce((n, e) => n + e.missingPx, 0), 0),
    zones: zoneStates, regions, ...evaluateClosure(house, annotation, context) };
}

/** Function outlines constrain topology; they never replace observed solid wall
 * coordinates. Only evidenced passage/railing/air edges can add logical spans. */
export function closeWallsWithFunctionalZones(input: SourceWallTraceV1, observed: SourceAnnotationV1,
  allZones: SourceFunctionalZone[], context: ReconstructionAssemblyContext) {
  const zones = allZones.filter(z => z.decision === 'accept'), original = structuredClone(input);
  let trace = structuredClone(input), house = buildBareHouse(trace);
  const initialMetrics = state(house, observed, zones, context);
  const limit = Math.min(Math.max(6, Math.min(context.sourceWidthPx ?? 900, context.sourceHeightPx ?? 900) * 0.01), 9);
  const boundaryChanges: { zoneIndex: number; label: string; edge: number; kind: ZoneEdgeKind; status: string; evidence: string; addedSourceWallIndices?: number[] }[] = [];
  const passages: { zoneIndex: number; edge: number; start: DraftPoint; end: DraftPoint; curvePoint?: DraftPoint; evidence: string }[] = [];
  for (const [zoneIndex, zone] of zones.entries()) for (const [edge, b] of zone.boundary.entries()) {
    const end = zone.boundary[(edge + 1) % zone.boundary.length].point;
    if (!['passage', 'railing', 'air'].includes(b.kind)) continue;
    const base = { zoneIndex, label: zone.label, edge, kind: b.kind, evidence: b.evidence };
    if (b.kind === 'air' && zone.environment === 'indoor') { boundaryChanges.push({ ...base, status: 'indoor-air-divider-not-authorized-use-passage' }); continue; }
    const path = { start: b.point, end, ...(b.curvePoint ? { curvePoint: b.curvePoint } : {}) };
    const coverage = b.curvePoint ? wallPathCoverage(path, trace.walls) : edgeCoverage(b.point, end, trace);
    // A nearby but differently shaped path is ambiguous evidence, not a second
    // copy or permission to merge two parallel balcony/facade boundaries.
    if (b.curvePoint && wallPathCoverage(path, trace.walls, 3).segments.some(near =>
      !coverage.segments.some(exact => exact.wallIndex === near.wallIndex))) {
      boundaryChanges.push({ ...base, status: 'nearby-noncoincident-curve-needs-review' }); continue;
    }
    if (b.kind === 'passage') {
      const anchored = [b.point, end].every(p => original.walls.some(w => (projectOntoWall(p, w)?.distance ?? Infinity) <= limit));
      if (!anchored) { boundaryChanges.push({ ...base, status: 'passage-ends-lack-observed-boundaries' }); continue; }
      // A passage cannot erase a source-observed window.
      const overlaps = (o: NonNullable<SourceAnnotationV1['openings']>[number]) => {
        if (!b.curvePoint) return edgeCoverage(o.endpoints[0], o.endpoints[1], { walls: [path] }).segments.length > 0;
        return wallPathCoverage(path, original.walls, 3).segments.some(span => {
          const host = original.walls[span.wallIndex], aperture = o.endpoints.map(p => projectOntoWall(p, host));
          if (aperture.some(p => !p || p.distance > 3)) return false;
          const threshold = [span.low, span.high].map(t => projectOntoWall(wallPointAt(path, t), host)!.position);
          return Math.min(Math.max(...threshold), Math.max(...aperture.map(p => p!.position)))
            - Math.max(Math.min(...threshold), Math.min(...aperture.map(p => p!.position))) > 1e-9;
        });
      };
      if ((observed.openings ?? []).some(o => o.kind === 'window' && overlaps(o))) {
        boundaryChanges.push({ ...base, status: 'passage-conflicts-with-observed-window' }); continue;
      }
      const conflicts = (observed.openings ?? []).some(o => o.kind === 'door'
        && overlaps(o)
        && Math.min(distance(o.endpoints[0], b.point) + distance(o.endpoints[1], end), distance(o.endpoints[1], b.point) + distance(o.endpoints[0], end)) > 6);
      if (conflicts) { boundaryChanges.push({ ...base, status: 'observed-door-extent-takes-precedence' }); continue; }
    }
    if (zones.some(other => other !== zone && (projectOntoWall(other.position, path)?.distance ?? Infinity) <= 2)) {
      boundaryChanges.push({ ...base, status: 'logical-span-crosses-another-zone-seed' }); continue;
    }
    const added: number[] = [];
    if (b.kind === 'railing') for (const s of coverage.segments) {
      const w = trace.walls[s.wallIndex];
      if (distance(w.start, b.point) + distance(w.end, end) <= 6 || distance(w.end, b.point) + distance(w.start, end) <= 6) w.boundaryType = 'railing';
    }
    // Insert uncovered intervals only; shared boundaries are stored once.
    for (const gap of coverage.gaps) {
      if (distance(gap.start, gap.end) <= 1e-6) continue;
      added.push(trace.walls.length);
      trace.walls.push({ start: gap.start, end: gap.end, ...(gap.curvePoint ? { curvePoint: gap.curvePoint } : {}),
        ...(b.kind === 'passage' ? {} : { boundaryType: b.kind as 'air' | 'railing' }) });
    }
    if (b.kind === 'passage') passages.push({ zoneIndex, edge, ...path, evidence: b.evidence });
    boundaryChanges.push({ ...base, status: added.length ? 'logical-span-added' : 'existing-baseline-reused', addedSourceWallIndices: added });
  }
  house = buildBareHouse(trace);
  // Candidate diagnostics also inspect program-added endpoints. Keep an
  // immutable reference for them without weakening bounds on observed walls.
  const candidateReference = structuredClone(trace);
  candidateReference.walls.splice(0, original.walls.length, ...structuredClone(original.walls));
  const derivedFor = (current: BareHouseV1) => {
    const openings = [...(observed.openings ?? [])];
    const audits: { zoneIndex: number; edge: number; status: string; endpoints: DraftPoint[]; openingIndices: number[] }[] = [];
    for (const passage of passages) {
      if ((observed.openings ?? []).some(o => o.kind === 'door' && Math.min(distance(o.endpoints[0], passage.start) + distance(o.endpoints[1], passage.end), distance(o.endpoints[1], passage.start) + distance(o.endpoints[0], passage.end)) <= 6)) {
        audits.push({ zoneIndex: passage.zoneIndex, edge: passage.edge, status: 'existing-observed-door', endpoints: [passage.start, passage.end], openingIndices: [] }); continue;
      }
      const coverage = passage.curvePoint ? wallPathCoverage(passage, current.walls, 3) : edgeCoverage(passage.start, passage.end, current), indices: number[] = [];
      if (coverage.gaps.some(g => wallPathProfile(g).length > 3)) { audits.push({ zoneIndex: passage.zoneIndex, edge: passage.edge, status: 'unresolved-logical-host', endpoints: [passage.start, passage.end], openingIndices: [] }); continue; }
      // Each normalized host receives only its own portion; source-observed doors
      // retain the original strict one-host rule and are never split here.
      const length = distance(passage.start, passage.end), dx = (passage.end.x - passage.start.x) / length, dy = (passage.end.y - passage.start.y) / length;
      for (const span of coverage.segments) {
        const endpoints = [span.low, span.high].map(t => passage.curvePoint ? wallPointAt(passage, t)
          : { x: passage.start.x + dx * t, y: passage.start.y + dy * t }) as [DraftPoint, DraftPoint];
        const duplicate = openings.some(o => o.kind === 'door' && Math.min(distance(o.endpoints[0], endpoints[0]) + distance(o.endpoints[1], endpoints[1]), distance(o.endpoints[1], endpoints[0]) + distance(o.endpoints[0], endpoints[1])) <= 1e-5);
        if (duplicate || distance(endpoints[0], endpoints[1]) <= 1e-6) continue;
        indices.push(openings.length); openings.push({ kind: 'door', endpoints, evidence: `Functional passage: ${passage.evidence}`,
          doorType: 'opening', typeEvidence: 'Source-supported leafless functional threshold; program-owned logical host interval.' });
      }
      audits.push({ zoneIndex: passage.zoneIndex, edge: passage.edge, status: 'derived-leafless-passage', endpoints: [passage.start, passage.end], openingIndices: indices });
    }
    return { annotation: { ...observed, openings }, audits };
  };
  let derived = derivedFor(house), metrics = state(house, derived.annotation, zones, context);
  const afterLogicalBoundaries = metrics;
  const accepted: { moves: unknown[]; beforeResolved: number; afterResolved: number }[] = [];
  const trials: { sourcePoints: DraftPoint[]; status: string; beforeResolved: number; afterResolved?: number; reason?: string }[] = [];
  let trialCount = 0;
  while (trialCount < 64 && accepted.length < 12) {
    const candidates = reviewFurnitureClosureCandidates(trace, derived.annotation, context, candidateReference).candidates
      // Extending one observed run can create a T-junction at an existing
      // corner. Do not drag its non-collinear neighbour off its source path.
      .map(c => ({ ...c, endpoints: c.endpoints.filter(e => {
        const w = trace.walls[e.wallIndex], a = w[e.endpoint === 'start' ? 'end' : 'start'], b = w[e.endpoint];
        const dx = b.x - a.x, dy = b.y - a.y, mx = c.to.x - b.x, my = c.to.y - b.y;
        return dx * mx + dy * my >= -1e-8 && Math.abs(dx * my - dy * mx) <= 1e-6 * Math.hypot(dx, dy) * Math.max(1, Math.hypot(mx, my));
      }) }))
      .filter(c => c.endpoints.length > 0)
      .filter(c => c.endpoints.every(e => e.wallIndex < original.walls.length)
        && zones.some(z => z.boundary.some(b => b.kind !== 'passage' && distance(b.point, c.to) <= limit * 2)));
    const groups = [...candidates.map(c => [c])];
    for (let i = 0; i < candidates.length && groups.length < 64; i++) for (let j = i + 1; j < candidates.length && groups.length < 64; j++) {
      if (distance(candidates[i].from, candidates[j].from) > 1e-6) groups.push([candidates[i], candidates[j]]);
    }
    let best: { trace: SourceWallTraceV1; house: BareHouseV1; metrics: typeof metrics; derived: typeof derived; moves: typeof groups[number] } | undefined;
    let ambiguous = false;
    for (const moves of groups) {
      if (trialCount++ >= 64) break;
      const trial = structuredClone(trace);
      for (const c of moves) for (const e of c.endpoints) trial.walls[e.wallIndex][e.endpoint] = { ...c.to };
      const crossed = trial.walls.some((w, i) => i < original.walls.length && ((observed.furniture ?? []).some(f =>
        (projectOntoWall(f.position, trace.walls[i])?.distance ?? 0) > 1e-6 && (projectOntoWall(f.position, w)?.distance ?? Infinity) <= 1e-6)
        || ['start', 'end'].some(k => distance(w[k as 'start' | 'end'], original.walls[i][k as 'start' | 'end']) > limit + 1e-6)));
      const collapsedOrFlipped = trial.walls.some((w, i) => i < original.walls.length && (distance(w.start, w.end) < 1e-6
        || (w.end.x - w.start.x) * (original.walls[i].end.x - original.walls[i].start.x)
          + (w.end.y - w.start.y) * (original.walls[i].end.y - original.walls[i].start.y) <= 0));
      if (crossed || collapsedOrFlipped) continue;
      try {
        const nextHouse = buildBareHouse(trial), nextDerived = derivedFor(nextHouse), next = state(nextHouse, nextDerived.annotation, zones, context);
        const observedCount = assemblePlan2WorldDraftWithReview(nextHouse, observed, context).openingReview.sourceIntervals.length;
        const originalCount = assemblePlan2WorldDraftWithReview(house, observed, context).openingReview.sourceIntervals.length;
        const improves = next.resolvedZoneCount > metrics.resolvedZoneCount || next.resolvedZoneCount === metrics.resolvedZoneCount && next.uncoveredBoundaryPx < metrics.uncoveredBoundaryPx - 1e-6;
        const valid = improves && next.closedZoneCount >= metrics.closedZoneCount
          && metrics.closedAnchors.every((closed, i) => !closed || next.closedAnchors[i]) && observedCount === originalCount
          && nextDerived.audits.every(a => a.status !== 'unresolved-logical-host')
          && metrics.zones.every((z, i) => !z.resolved || next.zones[i].resolved);
        trials.push({ sourcePoints: moves.map(m => m.from), status: valid ? 'eligible-zone-separation-gain' : 'no-safe-functional-gain', beforeResolved: metrics.resolvedZoneCount, afterResolved: next.resolvedZoneCount });
        if (valid && (!best || next.resolvedZoneCount > best.metrics.resolvedZoneCount
          || next.resolvedZoneCount === best.metrics.resolvedZoneCount && next.uncoveredBoundaryPx < best.metrics.uncoveredBoundaryPx - 1e-6)) {
          best = { trace: trial, house: nextHouse, metrics: next, derived: nextDerived, moves }; ambiguous = false;
        } else if (valid && best && next.resolvedZoneCount === best.metrics.resolvedZoneCount && Math.abs(next.uncoveredBoundaryPx - best.metrics.uncoveredBoundaryPx) <= 1e-6
          && moves.some(move => best!.moves.some(other => move.endpoints.some(e => other.endpoints.some(o => e.wallIndex === o.wallIndex && e.endpoint === o.endpoint))
            && distance(move.to, other.to) > 1e-6))) ambiguous = true;
      } catch (error) { trials.push({ sourcePoints: moves.map(m => m.from), status: 'rejected-program-conflict', beforeResolved: metrics.resolvedZoneCount, reason: String(error) }); }
    }
    if (!best || ambiguous) {
      if (ambiguous) trials.push({ sourcePoints: best!.moves.map(m => m.from), status: 'ambiguous-equal-gain-targets-retained', beforeResolved: metrics.resolvedZoneCount });
      break;
    }
    accepted.push({ moves: best.moves, beforeResolved: metrics.resolvedZoneCount, afterResolved: best.metrics.resolvedZoneCount });
    trace = best.trace; house = best.house; derived = best.derived; metrics = best.metrics;
  }
  const openingResult = assemblePlan2WorldDraftWithReview(house, derived.annotation, context).openingReview;
  const unresolvedDerivedOpenings = derived.audits.filter(a => a.status === 'unresolved-logical-host');
  const totalExpectedOpenings = derived.annotation.openings?.length ?? 0;
  return { bareHouse: house, annotation: derived.annotation, normalizationInput: trace, review: {
    policy: FUNCTIONAL_ZONE_POLICY, llmCalls: 0, maxEndpointMovementPx: limit, acceptedZoneCount: zones.length,
    initialMetrics, afterLogicalBoundaries, finalMetrics: metrics, boundaryChanges, derivedPassages: derived.audits,
    unresolvedDerivedOpenings, allOpeningHostsResolved: openingResult.sourceIntervals.length === totalExpectedOpenings,
    accepted, trials, trialCount: Math.min(trialCount, 64), normalizationInput: trace, normalizationInputIsProgramDerived: true,
    closureRule: 'All accepted functional zones, including balconies, require a closed logical boundary. Passage baselines remain traversable; railing/air edges close native faces without becoming opaque full-height walls.',
    limitation: 'Function outlines remain uncertain observations. No new solid wall is invented; unknown, ambiguous noncoincident paths and unsupported entrances stay review findings. Evidenced curves retain their native path. Distinct zone seeds and approximate area consistency are constraints, not source ground truth.' } };
}
