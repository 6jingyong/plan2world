import { buildBareHouse, type SourceWallTraceV1 } from './bareHouse';
import type { DraftPoint } from './draft';
import type { ReconstructionAssemblyContext, SourceAnnotationV1 } from './reconstructionAssembly';
import { DEFAULT_CLEARANCE_RADIUS_CM } from '$lib/utils/floorClearance';
import { evaluateLogicalGeometry, preservesLogicalGeometry } from './logicalGeometryConstraints';
import type { SourceFunctionalZone } from './functionalZones';
import { reviewWallEnvelopeUse, WALL_ENVELOPE_USE_POLICY, type WallEnvelopeUse } from './wallEnvelopeUse';

export const LOGICAL_WALL_POLICY = 'close-parallel-logical-envelope-v1' as const;
type Wall = SourceWallTraceV1['walls'][number];
type Metrics = ReturnType<typeof evaluateLogicalGeometry>['metrics'];
const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a: DraftPoint, b: DraftPoint) => a.x * b.x + a.y * b.y;
const minus = (a: DraftPoint, b: DraftPoint) => ({ x: a.x - b.x, y: a.y - b.y });


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
    ...zones.filter(z => z.decision !== 'reject').map(z => z.position)];
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
  let current = evaluateLogicalGeometry(trace, annotation, context, positions, origins);
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
      const state = evaluateLogicalGeometry(next, nextAnnotation, context, positions, nextOrigins), reason = preservesLogicalGeometry(current.metrics, state.metrics);
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
