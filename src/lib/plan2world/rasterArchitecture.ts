import { buildBareHouse, type BareHouseV1, type SourceWallTraceV1 } from './bareHouse';
import type { SourceAnnotationV1, ReconstructionAssemblyContext } from './reconstructionAssembly';
import type { DraftPoint } from './draft';
import { inkReader, reviewRasterWallContinuations, type SourceRasterInput } from './rasterWallContinuation';
import { evaluateClosure, reviewFurnitureClosureCandidates } from './furnitureGuidedClosure';
import { resolveOpeningHost } from './sourceOpenings';
import { wallPointAt } from '$lib/utils/wallPath';
import { projectOntoWall } from '$lib/utils/wallProjection';

const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Thick wall ink may sit off a zero-width centerline. Require a connected
 * solid-ink component from an observed branch to the host corridor; a nearby
 * isolated black mark or a thin frame is not sufficient evidence. */
function connectedPier(ink: (x: number, y: number) => boolean, node: DraftPoint,
  hostDirection: DraftPoint, branchDirection: DraftPoint, radius: number) {
  const solid = (x: number, y: number) => {
    let count = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) count += Number(ink(x + dx, y + dy));
    return count >= 8;
  };
  const seeds: DraftPoint[] = [];
  for (let d = 5; d <= Math.min(12, radius); d++) for (let offset = -4; offset <= 4; offset++) {
    const x = Math.round(node.x + branchDirection.x * d - branchDirection.y * offset);
    const y = Math.round(node.y + branchDirection.y * d + branchDirection.x * offset);
    if (solid(x, y)) seeds.push({ x, y });
  }
  const queue = [...seeds], seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i], key = `${point.x},${point.y}`;
    if (seen.has(key) || distance(point, node) > radius || !solid(point.x, point.y)) continue;
    seen.add(key);
    const perpendicular = Math.abs((point.x - node.x) * hostDirection.y - (point.y - node.y) * hostDirection.x);
    if (perpendicular <= 3) return { solidPierPoint: point, branchSeed: seeds[0], searchedPixels: seen.size };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) queue.push({ x: point.x + dx, y: point.y + dy });
  }
}

/** A window may straddle a normalized T-junction by a few source pixels. Keep
 * the dominant finite host only when original pixels connect its pier to the
 * branch, and clamp just the overshooting end. Never split an opening through
 * an interior partition or silently omit it. */
export function refineWindowsAtNormalizedJunctions(house: BareHouseV1, input: SourceAnnotationV1,
  context: ReconstructionAssemblyContext, raster: SourceRasterInput) {
  const annotation = structuredClone(input), pixels = inkReader(raster);
  const limit = Math.min(9, Math.max(6, Math.min(context.sourceWidthPx ?? raster.width, context.sourceHeightPx ?? raster.height) * 0.01));
  const audits: { openingIndex: number; status: string; before: DraftPoint[]; after?: DraftPoint[];
    wallId?: string; node?: DraftPoint; movementPx?: number; pixelEvidence?: ReturnType<typeof connectedPier> }[] = [];
  for (const [openingIndex, opening] of (annotation.openings ?? []).entries()) {
    if (opening.kind !== 'window') continue;
    try { if (resolveOpeningHost(opening.endpoints, new Map(house.walls.map(w => [w.id, w])), 3, undefined, 'window')) continue; }
    catch { audits.push({ openingIndex, status: 'ambiguous-host-kept', before: opening.endpoints }); continue; }
    const before = structuredClone(opening.endpoints), span = distance(...before);
    if (span < 8) continue;
    const choices: { wallId: string; node: DraftPoint; movementPx: number; after: DraftPoint[];
      pixelEvidence: NonNullable<ReturnType<typeof connectedPier>> }[] = [];
    for (const wall of house.walls) {
      if (wall.curvePoint) continue;
      const projected = before.map(p => projectOntoWall(p, wall)!);
      if (projected.some(p => !p || p.distance > limit)
        || distance(wallPointAt(wall, projected[0].position), wallPointAt(wall, projected[1].position)) < span * 0.8) continue;
      const wallLength = distance(wall.start, wall.end), direction = { x: (wall.end.x - wall.start.x) / wallLength, y: (wall.end.y - wall.start.y) / wallLength };
      const alignment = Math.abs((before[1].x - before[0].x) * direction.x + (before[1].y - before[0].y) * direction.y) / span;
      if (alignment < Math.cos(Math.PI / 18)) continue;
      for (const endpoint of [0, 1]) {
        const p = projected[endpoint]; if (p.position !== 0 && p.position !== 1) continue;
        const node = wallPointAt(wall, p.position), other = wallPointAt(wall, projected[1 - endpoint].position);
        const branches = house.walls.filter(branch => branch.id !== wall.id && !branch.curvePoint
          && (distance(branch.start, node) < 1e-5 || distance(branch.end, node) < 1e-5));
        for (const branch of branches) {
          const far = distance(branch.start, node) < 1e-5 ? branch.end : branch.start, branchLength = distance(far, node);
          const branchDirection = { x: (far.x - node.x) / branchLength, y: (far.y - node.y) / branchLength };
          if (Math.abs(direction.x * branchDirection.x + direction.y * branchDirection.y) > Math.cos(Math.PI / 6)) continue;
          const pixelEvidence = connectedPier(pixels.ink, node, direction, branchDirection, limit * 2);
          if (!pixelEvidence) continue;
          const toward = { x: (other.x - node.x) / distance(node, other), y: (other.y - node.y) / distance(node, other) };
          const point = { x: node.x + toward.x * 3, y: node.y + toward.y * 3 }, movementPx = distance(point, before[endpoint]);
          if (movementPx > limit + 3 + Math.SQRT2 || movementPx > span * 0.2 || distance(point, other) < 8) continue;
          const after = before.map((_, i) => wallPointAt(wall, projected[i].position)); after[endpoint] = point;
          if (!choices.some(c => c.wallId === wall.id && distance(c.after[endpoint], point) < 1e-5)) choices.push({ wallId: wall.id, node, movementPx, after, pixelEvidence });
        }
      }
    }
    if (choices.length !== 1) { audits.push({ openingIndex, status: choices.length ? 'ambiguous-pier-host-kept' : 'no-supported-junction-refinement', before }); continue; }
    const choice = choices[0]; opening.endpoints = choice.after as [DraftPoint, DraftPoint];
    audits.push({ openingIndex, status: 'bounded-normalized-junction-trim', before, ...choice });
  }
  return { annotation, review: { policy: 'raster-normalized-window-junction-v1', maxJunctionDistancePx: limit, audits } };
}

/** Refine approximate WINDOW ends only where an observed partition continuation
 * meets a visibly solid pier. Door evidence is never shortened. Raw source
 * observations are untouched. Every changed endpoint has bounded pixel evidence.
 */
export function refineRasterWindows(trace: SourceWallTraceV1, input: SourceAnnotationV1,
  context: ReconstructionAssemblyContext, raster: SourceRasterInput) {
  const annotation = structuredClone(input), house = buildBareHouse(trace), pixels = inkReader(raster);
  const junctions = reviewFurnitureClosureCandidates(trace, { ...annotation, openings: [] }, context);
  const maxMovementPx = junctions.maxEndpointMovementPx * 2 + Math.SQRT2;
  const audits: { openingIndex: number; status: string; before: DraftPoint[]; after?: DraftPoint[];
    junction?: DraftPoint; movementPx?: number; solidSamples?: number[]; reason?: string }[] = [];
  const candidateAudits: { openingIndex: number; junction: DraftPoint; status: string; solidSamples: number[]; movementPx?: number }[] = [];
  for (const [openingIndex, opening] of (annotation.openings ?? []).entries()) {
    if (opening.kind !== 'window') continue;
    const before = structuredClone(opening.endpoints);
    let host;
    try { host = resolveOpeningHost(opening.endpoints, new Map(house.walls.map(w => [w.id, w])), 3, undefined, 'window'); }
    catch (error) { audits.push({ openingIndex, status: 'unresolved-host', before, reason: String(error) }); continue; }
    if (!host || host.wall.curvePoint) continue;
    const ends = host.projected.map(p => wallPointAt(host.wall, p.position));
    const choices: { endpoint: number; point: DraftPoint; junction: DraftPoint; movementPx: number; solidSamples: number[] }[] = [];
    for (const candidate of junctions.candidates) {
      if (!house.sourceWallMap[candidate.targetSourceWall]?.includes(host.id)) continue;
      const endpoint = distance(candidate.to, ends[0]) <= distance(candidate.to, ends[1]) ? 0 : 1;
      if (distance(candidate.to, ends[endpoint]) > junctions.maxEndpointMovementPx) continue;
      const other = ends[1 - endpoint], span = distance(ends[0], ends[1]);
      const length = distance(candidate.to, other);
      const direction = { x: (other.x - candidate.to.x) / length, y: (other.y - candidate.to.y) / length };
      const normal = { x: -direction.y, y: direction.x };
      const solidSamples: number[] = [];
      // Five transverse pixels distinguish a solid pier from thin window frame
      // lines. Three consecutive clear sections establish its interior edge.
      for (let d = 0; d <= junctions.maxEndpointMovementPx; d++) {
        let inkCount = 0;
        for (let n = -2; n <= 2; n++) inkCount += Number(pixels.ink(candidate.to.x + direction.x * d + normal.x * n,
          candidate.to.y + direction.y * d + normal.y * n));
        solidSamples.push(inkCount);
      }
      if (!solidSamples.slice(0, 3).every(count => count >= 4)) {
        candidateAudits.push({ openingIndex, junction: candidate.to, status: 'insufficient-solid-pier', solidSamples }); continue;
      }
      const edge = solidSamples.findIndex((count, i) => i >= 3 && count < 4 && solidSamples[i + 1] < 4 && solidSamples[i + 2] < 4);
      if (edge < 0) { candidateAudits.push({ openingIndex, junction: candidate.to, status: 'no-bounded-pier-edge', solidSamples }); continue; }
      const point = { x: candidate.to.x + direction.x * (edge + 3), y: candidate.to.y + direction.y * (edge + 3) };
      const movementPx = distance(point, before[endpoint]);
      if (movementPx > maxMovementPx || movementPx > span * 0.2 || distance(point, other) >= span || distance(point, other) < 8) {
        candidateAudits.push({ openingIndex, junction: candidate.to, status: 'trim-exceeds-source-bound', solidSamples, movementPx }); continue;
      }
      candidateAudits.push({ openingIndex, junction: candidate.to, status: 'supported-pier-endpoint', solidSamples, movementPx });
      choices.push({ endpoint, point, junction: candidate.to, movementPx, solidSamples });
    }
    // Equivalent candidates from two incident strokes are one geometric choice.
    const unique = choices.filter((choice, i) => !choices.slice(0, i).some(other => other.endpoint === choice.endpoint
      && distance(other.point, choice.point) < 0.1));
    if (unique.length !== 1) {
      if (unique.length) audits.push({ openingIndex, status: 'ambiguous-pier', before });
      continue;
    }
    const choice = unique[0];
    opening.endpoints = ends as [DraftPoint, DraftPoint]; opening.endpoints[choice.endpoint] = choice.point;
    audits.push({ openingIndex, status: 'bounded-solid-pier-trim', before, after: structuredClone(opening.endpoints),
      junction: choice.junction, movementPx: choice.movementPx, solidSamples: choice.solidSamples });
  }
  return { annotation, review: { policy: 'raster-window-jamb-refinement-v1', maxMovementPx, audits, candidates: candidateAudits,
    limitation: 'Only near-endpoint windows at observed straight-partition continuations with a solid raster pier are shortened. Unclear or interior conflicts remain unresolved; doors are never trimmed.' } };
}

/** Production selection uses the SAME native regions, anchors and opening
 * resolver as final assembly. No third model call or post-generation patch. */
export function continueRasterWalls(trace: SourceWallTraceV1, annotation: SourceAnnotationV1,
  context: ReconstructionAssemblyContext, raster: SourceRasterInput) {
  const review = reviewRasterWallContinuations(trace, annotation, raster);
  let normalizationInput = structuredClone(trace), metrics = evaluateClosure(buildBareHouse(trace), annotation, context);
  const before = metrics, selected: typeof review.suggestions = [];
  const trials: { candidate: typeof review.suggestions[number]; status: string; after?: typeof metrics; reason?: string }[] = [];
  for (const candidate of [...review.suggestions].sort((a, b) => b.score - a.score || a.sourceWallIndex - b.sourceWallIndex)) {
    const trial = structuredClone(normalizationInput);
    trial.walls.push({ start: candidate.from, end: candidate.to });
    try {
      const next = evaluateClosure(buildBareHouse(trial), annotation, context);
      const safe = next.furnishedRegionsWithEntrance > metrics.furnishedRegionsWithEntrance
        && next.furnishedRegionsWithoutEntrance <= metrics.furnishedRegionsWithoutEntrance
        && next.openingCount >= metrics.openingCount && next.overlappingAnchorCount <= metrics.overlappingAnchorCount
        && metrics.closedAnchors.every((closed, i) => !closed || next.closedAnchors[i]);
      trials.push({ candidate, status: safe ? 'selected' : 'no-safe-native-gain', after: next });
      if (safe) { normalizationInput = trial; metrics = next; selected.push(candidate); }
    } catch (error) { trials.push({ candidate, status: 'invalid-trial', reason: String(error) }); }
  }
  return { normalizationInput, review: { ...review, mode: 'production-native-trials', geometryChanged: selected.length > 0,
    before, after: metrics, selected, trials } };
}
