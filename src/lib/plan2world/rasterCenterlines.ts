import type { DraftPoint } from './draft';
import type { SourceWallTraceV1 } from './bareHouse';
import type { SourceAnnotationV1 } from './reconstructionAssembly';
import { decodeInkRuns, encodeInkRuns, type SourceRasterEvidence } from './rasterWallContinuation';

const dist = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (a: number[]) => { const s = [...a].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function projection(p: DraftPoint, a: DraftPoint, b: DraftPoint) {
  const dx = b.x - a.x, dy = b.y - a.y, t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return { t, point: { x: a.x + dx * t, y: a.y + dy * t } };
}
function segmentDistance(p: DraftPoint, a: DraftPoint, b: DraftPoint) {
  const t = Math.max(0, Math.min(1, projection(p, a, b).t));
  return dist(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}
/** Whole-image diagnostics use an isotropic sampling grid. These medial ridges
 * are candidates, not a second room graph and not permission to add walls. */
function rasterStructure(evidence: SourceRasterEvidence, trace: SourceWallTraceV1, annotation: SourceAnnotationV1) {
  const masks = [{ contrast: 95, runs: evidence.runs }, ...(evidence.layers ?? [])]
    .sort((a, b) => a.contrast - b.contrast).map(layer => ({ contrast: layer.contrast,
      data: decodeInkRuns(layer.runs, evidence.width, evidence.height) }));
  const base = masks.find(m => m.contrast === 95)!;
  const step = Math.max(1, Math.max(evidence.width, evidence.height) / 1400);
  const width = Math.ceil(evidence.width / step), height = Math.ceil(evidence.height / step), size = width * height;
  const mask = new Uint8Array(size), boundary = new Uint8Array(size), suppressed = new Uint8Array(size);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    mask[y * width + x] = base.data[Math.min(evidence.height - 1, Math.round(y * step)) * evidence.width
      + Math.min(evidence.width - 1, Math.round(x * step))];
  }
  const radiusPx = Math.max(6, Math.min(18, Math.min(evidence.width, evidence.height) * 0.018));
  const protectedRadiusPx = Math.max(3, Math.min(evidence.width, evidence.height) * 0.003);
  let seededAnchors = 0;
  for (const furniture of annotation.furniture ?? []) {
    const anchor = furniture.position, ax = anchor.x / step, ay = anchor.y / step, radius = radiusPx / step;
    let seed = -1, nearest = Infinity;
    // Position alone does not supply a furniture silhouette. Grow only existing
    // connected ink near an anchor, with a bounded radius; never erase pixels.
    for (let y = Math.max(0, Math.floor(ay - radius)); y <= Math.min(height - 1, Math.ceil(ay + radius)); y++)
      for (let x = Math.max(0, Math.floor(ax - radius)); x <= Math.min(width - 1, Math.ceil(ax + radius)); x++) {
        const d = Math.hypot(x - ax, y - ay), i = y * width + x;
        if (mask[i] && d < nearest && d <= radius) { seed = i; nearest = d; }
      }
    if (seed < 0) continue;
    seededAnchors++;
    const queue = [seed], seen = new Set<number>(queue);
    for (let q = 0; q < queue.length && q < 1024; q++) {
      const i = queue[q], x = i % width, y = Math.floor(i / width);
      const p = { x: x * step, y: y * step };
      if (trace.walls.some(w => !w.curvePoint && segmentDistance(p, w.start, w.end) <= protectedRadiusPx)) continue;
      suppressed[i] = 1;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy, j = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[j] || seen.has(j)
          || Math.hypot(nx - ax, ny - ay) > radius) continue;
        seen.add(j); queue.push(j);
      }
    }
  }
  // 3/4 chamfer distance transform: paired boundary distances provide a medial
  // ridge even for diagonal strokes. Outside-image pixels are background.
  const distance = new Uint16Array(size);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!mask[i]) continue;
    boundary[i] = Number(x === 0 || y === 0 || x === width - 1 || y === height - 1
      || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]);
    distance[i] = Math.min(x ? distance[i - 1] + 3 : 3, y ? distance[i - width] + 3 : 3,
      x && y ? distance[i - width - 1] + 4 : 4, x < width - 1 && y ? distance[i - width + 1] + 4 : 4);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (!mask[i]) continue;
    distance[i] = Math.min(distance[i], x < width - 1 ? distance[i + 1] + 3 : 3, y < height - 1 ? distance[i + width] + 3 : 3,
      x < width - 1 && y < height - 1 ? distance[i + width + 1] + 4 : 4,
      x && y < height - 1 ? distance[i + width - 1] + 4 : 4);
  }
  const ridges = new Uint8Array(size);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x, d = distance[i];
    if (!mask[i]) continue;
    ridges[i] = Number([1, width, width + 1, width - 1].some(offset => d >= distance[i - offset]
      && d >= distance[i + offset] && (d > distance[i - offset] || d > distance[i + offset])));
  }
  const count = (a: Uint8Array) => a.reduce((a, b) => a + b, 0);
  return { masks, weight: (p: DraftPoint) => {
    const x = Math.round(p.x / step), y = Math.round(p.y / step);
    return x >= 0 && y >= 0 && x < width && y < height && suppressed[y * width + x] ? 0.25 : 1;
  }, diagnostic: { width, height, sourcePixelsPerCell: step,
    boundaryRuns: encodeInkRuns(boundary), ridgeRuns: encodeInkRuns(ridges), furnitureSuppressionRuns: encodeInkRuns(suppressed),
    boundaryPixelCount: count(boundary), ridgePixelCount: count(ridges), suppressedPixelCount: count(suppressed), seededAnchors,
    furniturePolicy: { radiusPx, protectedRadiusPx, weight: 0.25, erasedPixels: 0, maxGrowthPixelsPerAnchor: 1024 },
    limitation: 'Medial ridges include text and furniture. They are diagnostic candidates, not inferred architectural walls.' } };
}

interface Sample { along: number; offset: number; width: number; weight: number; point: DraftPoint }
type Fit = { start: DraftPoint; end: DraftPoint; samples: Sample[]; support: number; coverage: number;
  angleDeg: number; residualPx: number; widthPx: number; movementPx: number };

function fitCenterline(wall: SourceWallTraceV1['walls'][number], annotation: SourceAnnotationV1,
  evidence: SourceRasterEvidence, structure: ReturnType<typeof rasterStructure>, maxMovementPx: number) {
  const length = dist(wall.start, wall.end);
  if (wall.curvePoint || length < 12) return { status: wall.curvePoint ? 'curve-kept' : 'short-segment-kept' };
  const d = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length }, n = { x: -d.y, y: d.x };
  const radius = Math.ceil(maxMovementPx + 12), samples: Sample[] = [];
  const apertures = (annotation.openings ?? []).filter(o => o.endpoints.every(p => segmentDistance(p, wall.start, wall.end) <= maxMovementPx)
    && Math.abs((o.endpoints[1].x - o.endpoints[0].x) * d.x + (o.endpoints[1].y - o.endpoints[0].y) * d.y) / dist(...o.endpoints) > 0.98)
    .map(o => o.endpoints.map(p => projection(p, wall.start, wall.end).t * length).sort((a, b) => a - b));
  let eligible = 0;
  const spacing = Math.max(1.5, length / 180);
  for (let along = 3; along <= length - 3; along += spacing) {
    if (apertures.some(([a, b]) => along >= a - 3 && along <= b + 3)) continue;
    eligible++;
    const p = { x: wall.start.x + d.x * along, y: wall.start.y + d.y * along };
    const sections = structure.masks.map(mask => {
      const runs: { offset: number; width: number }[] = []; let start: number | undefined;
      for (let o = -radius; o <= radius + 1; o++) {
        const x = Math.round(p.x + n.x * o), y = Math.round(p.y + n.y * o);
        const ink = o <= radius && x >= 0 && y >= 0 && x < evidence.width && y < evidence.height && mask.data[y * evidence.width + x];
        if (ink && start === undefined) start = o;
        if (!ink && start !== undefined) {
          const width = o - start, offset = (o + start - 1) / 2;
          if (start > -radius && o <= radius && width >= 3 && width <= 20 && Math.abs(offset) <= maxMovementPx) runs.push({ width, offset });
          start = undefined;
        }
      }
      return { contrast: mask.contrast, runs };
    });
    for (const run of sections.find(s => s.contrast === 95)!.runs) {
      const stable = sections.filter(s => s.runs.some(r => Math.abs(r.offset - run.offset) <= 1.5 && Math.abs(r.width - run.width) <= 4));
      if (stable.length < Math.min(2, sections.length)) continue;
      const point = { x: p.x + n.x * run.offset, y: p.y + n.y * run.offset };
      samples.push({ along, ...run, point, weight: structure.weight(point) });
    }
  }
  if (eligible < 5 || samples.length < 5) return { status: 'insufficient-thick-stroke', eligibleSamples: eligible };
  const choices: { intercept: number; slope: number; weight: number; inliers: Sample[] }[] = [];
  // Bounded Hough voting in the seed's local frame. Every transverse section
  // gets one vote; a thick cabinet cannot win by contributing more pixels.
  for (let angleDeg = -3; angleDeg <= 3; angleDeg += 0.5) {
    const slope = Math.tan(angleDeg * Math.PI / 180), votes = new Map<number, Sample[]>();
    for (const s of samples) {
      const intercept = Math.round((s.offset - slope * (s.along - length / 2)) * 2) / 2;
      if (Math.abs(intercept) > maxMovementPx) continue;
      const group = votes.get(intercept) ?? []; group.push(s); votes.set(intercept, group);
    }
    for (const intercept of votes.keys()) {
      const candidates = samples.filter(s => Math.abs(s.offset - intercept - slope * (s.along - length / 2)) <= 1.25);
      const unique = new Map<number, Sample>();
      for (const s of candidates) if (!unique.has(s.along) || Math.abs(s.offset - intercept) < Math.abs(unique.get(s.along)!.offset - intercept)) unique.set(s.along, s);
      const inliers = [...unique.values()];
      choices.push({ intercept, slope, weight: inliers.reduce((sum, s) => sum + s.weight, 0), inliers });
    }
  }
  choices.sort((a, b) => b.weight - a.weight || Math.abs(a.slope) - Math.abs(b.slope) || Math.abs(a.intercept) - Math.abs(b.intercept));
  const best = choices[0];
  if (!best || best.inliers.length < 5 || best.weight / eligible < 0.65) return { status: 'insufficient-stable-coverage', eligibleSamples: eligible };
  if (choices.some(c => c.weight >= best.weight * 0.9 && Math.abs(c.intercept - best.intercept) > 2.5)) return { status: 'ambiguous-parallel-strokes', eligibleSamples: eligible };
  // Robust regression after voting; final endpoint movement stays bounded.
  const meanX = best.inliers.reduce((s, p) => s + p.along, 0) / best.inliers.length;
  const meanY = best.inliers.reduce((s, p) => s + p.offset, 0) / best.inliers.length;
  const variance = best.inliers.reduce((s, p) => s + (p.along - meanX) ** 2, 0);
  const slope = best.inliers.reduce((s, p) => s + (p.along - meanX) * (p.offset - meanY), 0) / Math.max(1e-6, variance);
  const intercept = median(best.inliers.map(s => s.offset - slope * s.along));
  const at = (along: number) => ({ x: wall.start.x + d.x * along + n.x * (intercept + slope * along),
    y: wall.start.y + d.y * along + n.y * (intercept + slope * along) });
  const start = at(0), end = at(length), movementPx = Math.max(dist(start, wall.start), dist(end, wall.end));
  const residualPx = median(best.inliers.map(s => Math.abs(s.offset - intercept - slope * s.along)));
  const coverage = (Math.max(...best.inliers.map(s => s.along)) - Math.min(...best.inliers.map(s => s.along))) / length;
  if (movementPx > maxMovementPx || Math.abs(Math.atan(slope) * 180 / Math.PI) > 3 || residualPx > 0.9 || coverage < 0.55
    || [start, end].some(p => p.x < 0 || p.y < 0 || p.x >= evidence.width || p.y >= evidence.height)) return { status: 'fit-exceeds-evidence-bound', movementPx, coverage, residualPx };
  const fit: Fit = { start, end, movementPx, coverage, residualPx, samples: best.inliers,
    support: best.weight / eligible, angleDeg: Math.atan(slope) * 180 / Math.PI, widthPx: median(best.inliers.map(s => s.width)) };
  return { status: movementPx < 0.6 ? 'already-centered' : 'supported-fit', fit };
}

/** Explicit diagnostic only. Returns evidence and unapproved candidates; it
 * has no normalization/assembly output and cannot move walls, junctions,
 * openings or anchors. Production reconstruction never imports this module. */
export function reviewRasterCenterlines(trace: SourceWallTraceV1, annotation: SourceAnnotationV1,
  evidence: SourceRasterEvidence) {
  const structure = rasterStructure(evidence, trace, annotation);
  const maxMovementPx = Math.max(4, Math.min(9, Math.min(evidence.width, evidence.height) * 0.01));
  const audits = trace.walls.map((wall, sourceWallIndex) => {
    const result = fitCenterline(wall, annotation, evidence, structure, maxMovementPx);
    return { sourceWallIndex, before: structuredClone(wall), ...result,
      status: result.status === 'supported-fit' ? 'unapproved-candidate' : result.status };
  });
  return { policy: 'read-only-seeded-centerline-candidates-v1', mode: 'read-only' as const,
    llmCalls: 0, geometryChanged: false as const, appliedWallChanges: 0, appliedOpeningChanges: 0,
    thresholds: structure.masks.map(m => m.contrast), maxMovementPx, maxAngleDeg: 3, minStrokeWidthPx: 3,
    analysis: structure.diagnostic, audits,
    limitation: 'Candidates are unapproved diagnostics. No fitting result enters generation or modifies source observations, wall/junction geometry, openings or furniture. Raster styles can invalidate these assumptions.' };
}
