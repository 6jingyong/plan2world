import { buildBareHouse, type BareHouseV1, type SourceWallTraceV1 } from './bareHouse';
import { draftToProject, type DraftPoint } from './draft';
import { assemblePlan2WorldDraftWithReview, type ReconstructionAssemblyContext, type SourceAnnotationV1 } from './reconstructionAssembly';
import { reviewSourceTopology } from './sourceTopologyReview';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { projectOntoWall } from '$lib/utils/wallProjection';

export const FURNITURE_CLOSURE_POLICY = 'furniture-guided-local-closure-v1' as const;
type Endpoint = { wallIndex: number; endpoint: 'start' | 'end' };
type Candidate = { from: DraftPoint; to: DraftPoint; endpoints: Endpoint[]; targetSourceWall: string; movementPx: number };
type CandidateExclusion = { from: DraftPoint; targetWallId?: string; to?: DraftPoint;
  status: 'no-source-endpoint' | 'curved-junction' | 'curved-target' | 'no-forward-intersection'
    | 'movement-exceeds-source-bound' | 'observed-opening-conflict'; openingIndices?: number[] };
const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const copyTrace = (trace: SourceWallTraceV1): SourceWallTraceV1 => structuredClone(trace);

/** Continue an existing straight stroke to a finite observed boundary. */
function continuedIntersection(a: DraftPoint, b: DraftPoint, c: DraftPoint, d: DraftPoint): DraftPoint | undefined {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 1e-9) return;
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = (q.x * s.y - q.y * s.x) / denominator, u = (q.x * r.y - q.y * r.x) / denominator;
  if (t < 1 - 1e-9 || u < -1e-9 || u > 1 + 1e-9) return;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

function candidateConnections(trace: SourceWallTraceV1, original: SourceWallTraceV1, house: BareHouseV1,
  annotation: SourceAnnotationV1, context: ReconstructionAssemblyContext, limit: number, exclusions?: CandidateExclusion[]) {
  const review = reviewSourceTopology(house, context), candidates: Candidate[] = [];
  const owners = new Map(Object.entries(house.sourceWallMap).flatMap(([id, segments]) => segments.map(segment => [segment, id] as const)));
  for (const miss of review.nearMisses) {
    const endpoints: Endpoint[] = [];
    trace.walls.forEach((wall, wallIndex) => {
      const segments = house.sourceWallMap[`w${wallIndex + 1}`] ?? [];
      const first = house.walls.find(item => item.id === segments[0]), last = house.walls.find(item => item.id === segments.at(-1));
      if (first && distance(first.start, miss.sourcePoint) < 1e-6) endpoints.push({ wallIndex, endpoint: 'start' });
      if (last && distance(last.end, miss.sourcePoint) < 1e-6) endpoints.push({ wallIndex, endpoint: 'end' });
    });
    // Curved endpoint/control adjustments need their own supported constraint model.
    if (!endpoints.length) { exclusions?.push({ from: miss.sourcePoint, status: 'no-source-endpoint' }); continue; }
    if (endpoints.some(item => trace.walls[item.wallIndex].curvePoint)) {
      exclusions?.push({ from: miss.sourcePoint, status: 'curved-junction' }); continue;
    }
    for (const targetId of miss.candidateWallIds) {
      const target = house.walls.find(wall => wall.id === targetId)!;
      if (target.curvePoint) { exclusions?.push({ from: miss.sourcePoint, targetWallId: targetId, status: 'curved-target' }); continue; }
      for (const endpoint of endpoints) {
        const wall = trace.walls[endpoint.wallIndex];
        const other = wall[endpoint.endpoint === 'start' ? 'end' : 'start'];
        const to = continuedIntersection(other, wall[endpoint.endpoint], target.start, target.end);
        if (!to) { exclusions?.push({ from: miss.sourcePoint, targetWallId: targetId, status: 'no-forward-intersection' }); continue; }
        // Bound every move against original observations, never accumulated snaps.
        if (distance(to, miss.sourcePoint) > limit || endpoints.some(item => distance(to, original.walls[item.wallIndex][item.endpoint]) > limit)) {
          exclusions?.push({ from: miss.sourcePoint, to, targetWallId: targetId, status: 'movement-exceeds-source-bound' }); continue;
        }
        // Do not land a partition in the middle of an observed door/window aperture.
        const openingConflict = (opening: NonNullable<SourceAnnotationV1['openings']>[number]) => {
          const [a, b] = opening.endpoints, projected = projectOntoWall(to, { start: a, end: b });
          const span = distance(a, b);
          return projected && projected.distance <= house.maxJunctionDistancePx
            && projected.position * span > house.maxJunctionDistancePx
            && (1 - projected.position) * span > house.maxJunctionDistancePx;
        };
        if ((annotation.openings ?? []).some(openingConflict)) {
          exclusions?.push({ from: miss.sourcePoint, to, targetWallId: targetId, status: 'observed-opening-conflict',
            openingIndices: (annotation.openings ?? []).flatMap((opening, index) => openingConflict(opening) ? [index] : []) });
          continue;
        }
        const candidate = { from: { ...miss.sourcePoint }, to, endpoints,
          targetSourceWall: owners.get(targetId) ?? targetId,
          movementPx: Math.max(...endpoints.map(item => distance(to, original.walls[item.wallIndex][item.endpoint]))) };
        // Equivalent intersections with two facets/segments are one choice.
        if (!candidates.some(item => distance(item.from, candidate.from) < 1e-6
          && distance(item.to, candidate.to) < 1e-6 && item.targetSourceWall === candidate.targetSourceWall)) candidates.push(candidate);
      }
    }
  }
  return candidates.sort((a, b) => a.movementPx - b.movementPx || a.from.x - b.from.x || a.from.y - b.from.y
    || a.to.x - b.to.x || a.to.y - b.to.y || a.targetSourceWall.localeCompare(b.targetSourceWall));
}

/** Read-only explanation of guards that run BEFORE native trial evaluation.
 * Keep this separate from frozen stage serialization: adding a diagnostic does
 * not invalidate or rewrite historical geometry or alter candidate selection.
 */
export function reviewFurnitureClosureCandidates(trace: SourceWallTraceV1, annotation: SourceAnnotationV1,
  context: ReconstructionAssemblyContext = {}, original: SourceWallTraceV1 = trace) {
  const house = buildBareHouse(trace), exclusions: CandidateExclusion[] = [];
  const limit = Math.min(reviewSourceTopology(house, context).warningRadiusPx, house.maxJunctionDistancePx * 3);
  const candidates = candidateConnections(trace, original, house, annotation, context, limit, exclusions);
  return { policy: FURNITURE_CLOSURE_POLICY, geometryChanged: false as const, maxEndpointMovementPx: limit,
    candidates, exclusions, limitation: 'Candidate-generation diagnostics only. They do not rerun native trials, select connections or resolve conflicting source evidence.' };
}

export function evaluateClosure(house: BareHouseV1, annotation: SourceAnnotationV1, context: ReconstructionAssemblyContext) {
  const assembled = assemblePlan2WorldDraftWithReview(house, annotation, context);
  const floor = draftToProject(assembled.draft).floors[0], analysis = analyzeFloor(floor);
  const occupied = new Set<number>();
  const anchorRegions = floor.furniture.map(item => analysis.rooms.flatMap((room, index) =>
    !room.floorOpening && pointInPolygon(item.position, analysis.polygons.get(room.id) ?? [])
      && !(analysis.holes.get(room.id) ?? []).some(hole => pointInPolygon(item.position, hole)) ? [index] : []));
  for (const rooms of anchorRegions) for (const index of rooms) occupied.add(index);
  const doorRegions = new Set(analysis.rooms.flatMap((room, index) => floor.doors.some(door => room.walls.includes(door.wallId)) ? [index] : []));
  const closedAnchors = anchorRegions.map(rooms => rooms.length > 0);
  return { closedAnchors, occupiedRegionCount: occupied.size,
    overlappingAnchorCount: anchorRegions.filter(rooms => rooms.length > 1).length,
    furnishedRegionsWithEntrance: [...occupied].filter(index => doorRegions.has(index)).length,
    furnishedRegionsWithoutEntrance: [...occupied].filter(index => !doorRegions.has(index)).length,
    openingCount: assembled.openingReview.sourceIntervals.length,
    nativeRegionCount: analysis.rooms.length };
}

/** Furniture is available BEFORE final closure/freeze. Only bounded endpoint
 * normalization is explored; source observations and furniture points never move.
 */
export function closeWallsWithFurniture(trace: SourceWallTraceV1, annotation: SourceAnnotationV1,
  context: ReconstructionAssemblyContext = {}, options: { maxTrials?: number } = {}) {
  const original = copyTrace(trace);
  let normalizationInput = copyTrace(trace), bareHouse = buildBareHouse(trace);
  const limit = Math.min(reviewSourceTopology(bareHouse, context).warningRadiusPx, bareHouse.maxJunctionDistancePx * 3);
  let metrics = evaluateClosure(bareHouse, annotation, context);
  const initialMetrics = metrics, accepted: { candidate: Candidate; before: typeof metrics; after: typeof metrics }[] = [];
  const evaluated: { candidate: Candidate; status: string; metrics?: typeof metrics; reason?: string }[] = [];
  const maxTrials = options.maxTrials ?? 128;
  if (!Number.isInteger(maxTrials) || maxTrials < 0 || maxTrials > 1024) throw new Error('Invalid closure trial budget.');
  let trials = 0, ambiguousGroups = 0;
  if ((annotation.furniture?.length ?? 0) > 0) while (trials < maxTrials && accepted.length < 12) {
    const candidates = candidateConnections(normalizationInput, original, bareHouse, annotation, context, limit);
    const viable: { candidate: Candidate; metrics: typeof metrics; trace: SourceWallTraceV1; house: BareHouseV1 }[] = [];
    for (const candidate of candidates) {
      if (trials++ >= maxTrials) break;
      const trial = copyTrace(normalizationInput);
      for (const item of candidate.endpoints) trial.walls[item.wallIndex][item.endpoint] = { ...candidate.to };
      const crossesAnchor = (annotation.furniture ?? []).some(anchor => candidate.endpoints.some(item => {
        const before = projectOntoWall(anchor.position, normalizationInput.walls[item.wallIndex]);
        const after = projectOntoWall(anchor.position, trial.walls[item.wallIndex]);
        return before && after && before.distance > 1e-6 && after.distance <= 1e-6;
      }));
      if (crossesAnchor) { evaluated.push({ candidate, status: 'new-wall-path-crosses-furniture-anchor' }); continue; }
      // No source wall may collapse or flip after a proposed endpoint move.
      if (trial.walls.some((wall, index) => distance(wall.start, wall.end) < 1e-6
        || (wall.end.x - wall.start.x) * (original.walls[index].end.x - original.walls[index].start.x)
          + (wall.end.y - wall.start.y) * (original.walls[index].end.y - original.walls[index].start.y) <= 0)) continue;
      try {
        const house = buildBareHouse(trial);
        const exceedsBound = original.walls.some((wall, index) => {
          const segments = house.sourceWallMap[`w${index + 1}`];
          const first = house.walls.find(item => item.id === segments[0])!, last = house.walls.find(item => item.id === segments.at(-1))!;
          return distance(first.start, wall.start) > limit + 1e-6 || distance(last.end, wall.end) > limit + 1e-6;
        });
        if (exceedsBound) { evaluated.push({ candidate, status: 'normalization-exceeds-original-endpoint-bound' }); continue; }
        const next = evaluateClosure(house, annotation, context);
        const preservesAnchors = metrics.closedAnchors.every((closed, index) => !closed || next.closedAnchors[index]);
        const improves = next.furnishedRegionsWithEntrance > metrics.furnishedRegionsWithEntrance;
        const valid = preservesAnchors && improves && next.openingCount === metrics.openingCount
          && next.overlappingAnchorCount <= metrics.overlappingAnchorCount
          && next.furnishedRegionsWithoutEntrance <= metrics.furnishedRegionsWithoutEntrance;
        evaluated.push({ candidate, status: valid ? 'eligible' : 'no-safe-furnished-closure-gain', metrics: next });
        if (valid) viable.push({ candidate, metrics: next, trace: trial, house });
      } catch (error) {
        evaluated.push({ candidate, status: 'invalid-normalization-or-opening-hosts', reason: error instanceof Error ? error.message : String(error) });
      }
    }
    viable.sort((a, b) => b.metrics.furnishedRegionsWithEntrance - a.metrics.furnishedRegionsWithEntrance
      || b.metrics.closedAnchors.filter(Boolean).length - a.metrics.closedAnchors.filter(Boolean).length
      || a.candidate.movementPx - b.candidate.movementPx);
    const best = viable.find(item => {
      const ambiguous = viable.some(other => other !== item && distance(item.candidate.from, other.candidate.from) < 1e-6
        && other.candidate.targetSourceWall !== item.candidate.targetSourceWall
        && other.metrics.furnishedRegionsWithEntrance === item.metrics.furnishedRegionsWithEntrance
        && Math.abs(other.candidate.movementPx - item.candidate.movementPx) <= bareHouse.maxJunctionDistancePx);
      if (ambiguous) ambiguousGroups++;
      return !ambiguous;
    });
    if (!best) break;
    accepted.push({ candidate: best.candidate, before: metrics, after: best.metrics });
    normalizationInput = best.trace; bareHouse = best.house; metrics = best.metrics;
  }
  return { bareHouse, review: { policy: FURNITURE_CLOSURE_POLICY, maxEndpointMovementPx: limit,
    furnitureAnchorCount: annotation.furniture?.length ?? 0, initialMetrics, finalMetrics: metrics,
    accepted, evaluated, ambiguousCandidates: ambiguousGroups, trialCount: Math.min(trials, maxTrials),
    budgetReached: trials >= maxTrials, normalizationInput, normalizationInputIsProgramDerived: true,
    limitation: 'Local straight-endpoint continuation only. Furniture selects among observed-wall candidates; it cannot invent a missing wall or determine room boundaries alone. Greedy single-connection search does not resolve closures requiring several jointly useful connections. Curves and ambiguous targets remain unresolved.' } };
}
