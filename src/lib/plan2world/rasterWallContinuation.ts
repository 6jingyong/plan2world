import type { DraftPoint } from './draft';
import type { SourceWallTraceV1 } from './bareHouse';
import type { SourceAnnotationV1 } from './reconstructionAssembly';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { estimateRasterBackground, validRasterBackgroundEstimate, type RasterBackgroundEstimate, type RasterSamplingBounds } from './rasterBackground';

export const RASTER_CONTINUATION_POLICY = 'raster-supported-wall-continuation-experiment-v1' as const;
export interface SourceRasterPixels { width: number; height: number; data: ArrayLike<number> }
/** Lossless run-length encoding of the PROGRAM's neutral-ink mask. Freeze it
 * with the stage so deterministic assembly can replay without another image
 * observation or embedding millions of RGBA values. Source bytes/hash remain
 * in run provenance. Runs alternate clear/ink, beginning with clear. */
export interface SourceRasterEvidence {
  schemaVersion: 'source-ink-mask-v1'; width: number; height: number;
  polarity: string; background: number; runs: number[];
  /** Absent on legacy frozen masks, which replay without re-estimation. */
  backgroundEstimate?: RasterBackgroundEstimate;
  /** Additional source-derived contrast masks, not model observations. The
   * original 95-contrast mask remains the compatibility/replay baseline. */
  layers?: { contrast: number; runs: number[] }[];
}
export type SourceRasterInput = SourceRasterPixels | SourceRasterEvidence;
interface Stroke { width: number; offset: number }
interface Segment { start: DraftPoint; end: DraftPoint }
const length = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : 0;
};

export function encodeInkRuns(mask: ArrayLike<number>) {
  const runs: number[] = []; let value = 0, count = 0;
  for (let i = 0; i < mask.length; i++) {
    const pixel = Number(Boolean(mask[i]));
    if (pixel !== value) { runs.push(count); value = pixel; count = 0; }
    count++;
  }
  runs.push(count); return runs;
}

export function decodeInkRuns(runs: number[], width: number, height: number) {
  const mask = new Uint8Array(width * height); let offset = 0;
  runs.forEach((run, i) => { if (i % 2) mask.fill(1, offset, offset + run); offset += run; });
  return mask;
}

export function freezeRasterEvidence(raster: SourceRasterInput, focus?: RasterSamplingBounds): SourceRasterEvidence {
  if ('schemaVersion' in raster) {
    const validRuns = (runs: number[]) => Array.isArray(runs) && runs.length > 0
      && !runs.some((run, i) => !Number.isInteger(run) || run < (i ? 1 : 0))
      && runs.reduce((sum, run) => sum + run, 0) === raster.width * raster.height;
    if (raster.schemaVersion !== 'source-ink-mask-v1' || !Array.isArray(raster.runs)
      || !Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width < 8 || raster.height < 8
      || raster.width * raster.height > 24_000_000 || !Number.isFinite(raster.background)
      || !['dark-on-light', 'light-on-dark'].includes(raster.polarity)
      || (raster.backgroundEstimate !== undefined && (!validRasterBackgroundEstimate(raster.backgroundEstimate, raster.width, raster.height)
        || (raster.backgroundEstimate.status === 'ambiguous' && (raster.runs.length !== 1 || raster.layers?.some(layer => layer.runs.length !== 1)))))
      || !validRuns(raster.runs)
      || (raster.layers !== undefined && (!Array.isArray(raster.layers) || raster.layers.length !== 2
        || raster.layers.some((layer, i) => !layer || layer.contrast !== [55, 135][i] || !validRuns(layer.runs))))) throw new Error('Invalid frozen source ink mask.');
    return structuredClone(raster);
  }
  const { width, height, data } = raster;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
    || width * height > 24_000_000 || data.length !== width * height * 4) throw new Error('Expected bounded original-size RGBA source pixels.');
  const lightness = (index: number) => {
    const alpha = Number(data[index + 3]) / 255;
    return (0.299 * Number(data[index]) + 0.587 * Number(data[index + 1]) + 0.114 * Number(data[index + 2])) * alpha + 255 * (1 - alpha);
  };
  const { background, polarity, estimate: backgroundEstimate } = estimateRasterBackground(width, height,
    (x, y) => lightness((y * width + x) * 4), focus);
  const mask = new Uint8Array(width * height);
  const layers = [55, 135].map(contrast => ({ contrast, mask: new Uint8Array(width * height) }));
  for (let i = 0; i < mask.length; i++) {
    const index = i * 4, lum = lightness(index);
    const channels = [Number(data[index]), Number(data[index + 1]), Number(data[index + 2])];
    // Neutral, high-contrast strokes only. Dark furniture outlines can still
    // pass this mask, so pixels alone never authorize an architectural wall.
    const contrast = polarity === 'dark-on-light' ? background - lum : lum - background;
    const neutral = backgroundEstimate.status === 'resolved' && Math.max(...channels) - Math.min(...channels) <= 65;
    mask[i] = Number(contrast >= 95 && neutral);
    for (const layer of layers) layer.mask[i] = Number(contrast >= layer.contrast && neutral);
  }
  return { schemaVersion: 'source-ink-mask-v1', width, height, polarity, background, backgroundEstimate, runs: encodeInkRuns(mask),
    layers: layers.map(layer => ({ contrast: layer.contrast, runs: encodeInkRuns(layer.mask) })) };
}

export function inkReader(raster: SourceRasterInput) {
  const evidence = freezeRasterEvidence(raster), { width, height, polarity, background } = evidence;
  const mask = decodeInkRuns(evidence.runs, width, height);
  return { evidence, polarity, background, ink: (x: number, y: number) => {
    x = Math.round(x); y = Math.round(y);
    return x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] === 1 : false;
  } };
}

export function section(ink: (x: number, y: number) => boolean, point: DraftPoint, normal: DraftPoint, radius: number, minWidth: number, maxOffset: number): Stroke | undefined {
  const runs: Stroke[] = []; let start: number | undefined;
  for (let offset = -radius; offset <= radius + 1; offset++) {
    const dark = offset <= radius && ink(point.x + normal.x * offset, point.y + normal.y * offset);
    if (dark && start === undefined) start = offset;
    if (!dark && start !== undefined) {
      const width = offset - start, center = (start + offset - 1) / 2;
      if (start > -radius && offset <= radius && width >= minWidth && Math.abs(center) <= maxOffset) runs.push({ width, offset: center });
      start = undefined;
    }
  }
  return runs.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset) || b.width - a.width)[0];
}

function rayIntersection(from: DraftPoint, direction: DraftPoint, target: Segment) {
  const s = { x: target.end.x - target.start.x, y: target.end.y - target.start.y };
  const denominator = direction.x * s.y - direction.y * s.x;
  if (Math.abs(denominator) < 1e-6) return;
  const q = { x: target.start.x - from.x, y: target.start.y - from.y };
  const t = (q.x * s.y - q.y * s.x) / denominator, u = (q.x * direction.y - q.y * direction.x) / denominator;
  return t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? { distance: t, to: { x: from.x + direction.x * t, y: from.y + direction.y * t } } : undefined;
}

function openingConflicts(segment: Segment, openings: SourceAnnotationV1['openings'], tolerance: number) {
  const span = length(segment.start, segment.end), direction = { x: (segment.end.x - segment.start.x) / span, y: (segment.end.y - segment.start.y) / span };
  return (openings ?? []).flatMap((opening, index) => {
    const [a, b] = opening.endpoints, apertureLength = length(a, b), aperture = { start: a, end: b };
    const crossing = rayIntersection(segment.start, direction, aperture);
    const points = [segment.start, segment.end, ...(crossing && crossing.distance <= span ? [crossing.to] : [])];
    // A slightly oblique candidate can run alongside part of an aperture
    // without a mathematical crossing. Check its whole protected corridor.
    for (let d = 2; d < span; d += 2) points.push({ x: segment.start.x + direction.x * d, y: segment.start.y + direction.y * d });
    const pointConflict = points.some(point => {
      const p = projectOntoWall(point, aperture);
      return p && p.distance <= tolerance && p.position * apertureLength > tolerance && (1 - p.position) * apertureLength > tolerance;
    });
    // A collinear continuation must not fill an already observed aperture.
    const projected = [a, b].map(point => projectOntoWall(point, segment));
    const overlap = projected.every(p => p && p.distance <= tolerance)
      && Math.abs(projected[0]!.position - projected[1]!.position) * span > tolerance;
    return pointConflict || overlap ? [index] : [];
  });
}

/** Pure deterministic source-pixel experiment. No AI, inferred room polygons or
 * persisted geometry writes. Suggestions need native topology/host evaluation
 * before being used to generate a NEW experimental draft.
 */
export function reviewRasterWallContinuations(trace: SourceWallTraceV1, annotation: SourceAnnotationV1, raster: SourceRasterInput) {
  const pixels = inkReader(raster), shortSide = Math.min(raster.width, raster.height);
  const maxExtensionPx = shortSide * 0.2, radius = Math.max(8, Math.min(16, Math.round(shortSide * 0.014)));
  const references: { sourceWallIndex: number; endpoint: 'start' | 'end'; widthPx: number; supportedFraction: number; status: string }[] = [];
  const candidates: { sourceWallIndex: number; endpoint: 'start' | 'end'; targetWallIndex: number; from: DraftPoint; to: DraftPoint;
    lengthPx: number; angleAdjustmentDeg: number; referenceWidthPx: number; coverage: number; maxGapPx: number;
    medianWidthPx: number; meanOffsetPx: number; widthDeviation: number; score: number; status: string; openingIndices: number[]; furnitureIndices: number[] }[] = [];
  for (const [sourceWallIndex, wall] of trace.walls.entries()) {
    if (wall.curvePoint) continue;
    const seedLength = length(wall.start, wall.end); if (seedLength < 15) continue;
    for (const endpoint of ['start', 'end'] as const) {
      const from = wall[endpoint], other = wall[endpoint === 'start' ? 'end' : 'start'];
      const base = { x: (from.x - other.x) / seedLength, y: (from.y - other.y) / seedLength }, normal = { x: -base.y, y: base.x };
      const sampleLength = Math.min(32, seedLength * 0.6), reference: Stroke[] = [];
      let referenceSamples = 0;
      for (let d = 4; d <= sampleLength; d += 1) {
        referenceSamples++;
        const stroke = section(pixels.ink, { x: from.x - base.x * d, y: from.y - base.y * d }, normal, radius, 3, 4);
        if (stroke) reference.push(stroke);
      }
      const width = median(reference.map(s => s.width)), referenceFraction = reference.length / referenceSamples;
      const usable = referenceFraction >= 0.7 && width >= 3 && width <= radius;
      references.push({ sourceWallIndex, endpoint, widthPx: width, supportedFraction: referenceFraction, status: usable ? 'measured-neutral-stroke' : 'insufficient-reference-stroke' });
      if (!usable) continue;
      for (let angleAdjustmentDeg = -12; angleAdjustmentDeg <= 12; angleAdjustmentDeg += 2) {
        const angle = Math.atan2(base.y, base.x) + angleAdjustmentDeg * Math.PI / 180, direction = { x: Math.cos(angle), y: Math.sin(angle) };
        const hit = trace.walls.flatMap((target, targetWallIndex) => {
          if (targetWallIndex === sourceWallIndex || target.curvePoint) return [];
          const intersection = rayIntersection(from, direction, target);
          return intersection && intersection.distance > 3 ? [{ ...intersection, targetWallIndex }] : [];
        }).sort((a, b) => a.distance - b.distance || a.targetWallIndex - b.targetWallIndex)[0];
        if (!hit || hit.distance < Math.max(8, width * 1.5) || hit.distance > maxExtensionPx
          || hit.to.x < 0 || hit.to.y < 0 || hit.to.x >= raster.width || hit.to.y >= raster.height) continue;
        const candidateNormal = { x: -direction.y, y: direction.x }, widths: number[] = [], offsets: number[] = [];
        let samples = 0, gap = 0, maxGapPx = 0;
        // Ignore the junction itself at either end: thick piers are not proof
        // that the whole proposed continuation exists between them.
        for (let d = 4; d <= hit.distance - 4; d += 1) {
          samples++;
          const stroke = section(pixels.ink, { x: from.x + direction.x * d, y: from.y + direction.y * d }, candidateNormal,
            radius, Math.max(3, width * 0.45), Math.min(4, width * 0.7));
          if (stroke && stroke.width <= width * 1.8 + 2) { widths.push(stroke.width); offsets.push(Math.abs(stroke.offset)); gap = 0; }
          else { gap++; maxGapPx = Math.max(maxGapPx, gap); }
        }
        const coverage = widths.length / Math.max(1, samples), medianWidthPx = median(widths);
        const meanOffsetPx = offsets.reduce((a, b) => a + b, 0) / Math.max(1, offsets.length);
        const widthDeviation = median(widths.map(w => Math.abs(w - width))) / width;
        const openingIndices = openingConflicts({ start: from, end: hit.to }, annotation.openings, 3);
        const furnitureIndices = (annotation.furniture ?? []).flatMap((furniture, index) => {
          const p = projectOntoWall(furniture.position, { start: from, end: hit.to });
          return p && p.distance <= Math.max(1, width / 2) ? [index] : [];
        });
        const alreadyCovered = trace.walls.some((existing, index) => index !== sourceWallIndex && !existing.curvePoint
          && [from, hit.to].every(point => (projectOntoWall(point, existing)?.distance ?? Infinity) <= 3));
        const status = alreadyCovered ? 'already-covered-by-observed-wall'
          : coverage < 0.9 || maxGapPx > Math.max(3, width * 0.5) ? 'insufficient-continuous-pixel-support'
          : medianWidthPx < width * 0.6 || medianWidthPx > width * 1.6 ? 'inconsistent-stroke-width'
          : openingIndices.length ? 'observed-opening-conflict' : furnitureIndices.length ? 'furniture-anchor-conflict' : 'supported-candidate';
        const score = coverage - 0.15 * meanOffsetPx / width - 0.15 * widthDeviation;
        candidates.push({ sourceWallIndex, endpoint, targetWallIndex: hit.targetWallIndex, from: { ...from }, to: hit.to,
          lengthPx: hit.distance, angleAdjustmentDeg, referenceWidthPx: width, coverage, maxGapPx, medianWidthPx, meanOffsetPx,
          widthDeviation, score, status, openingIndices, furnitureIndices });
      }
    }
  }
  const suggestions: typeof candidates = [];
  for (const ref of references) {
    // Choose the best-supported stroke BEFORE semantic guards. A worse-angle
    // ray must not be selected simply because it skirts a blocked aperture,
    // furniture anchor or already observed wall.
    const group = candidates.filter(c => c.sourceWallIndex === ref.sourceWallIndex && c.endpoint === ref.endpoint
      && !['insufficient-continuous-pixel-support', 'inconsistent-stroke-width'].includes(c.status))
      .sort((a, b) => b.score - a.score || Math.abs(a.angleAdjustmentDeg) - Math.abs(b.angleAdjustmentDeg) || a.targetWallIndex - b.targetWallIndex);
    const best = group[0]; if (!best || best.status !== 'supported-candidate') continue;
    const ambiguous = group.some(other => other.targetWallIndex !== best.targetWallIndex && best.score - other.score < 0.05);
    if (ambiguous) {
      for (const candidate of group) if (candidate.status === 'supported-candidate') candidate.status = 'ambiguous-target';
    } else suggestions.push(best);
  }
  return { policy: RASTER_CONTINUATION_POLICY, mode: 'read-only-candidate-review' as const, llmCalls: 0, geometryChanged: false as const,
    raster: { width: raster.width, height: raster.height, polarity: pixels.polarity, borderLightness: pixels.background,
      ...(pixels.evidence.backgroundEstimate ? { backgroundEstimate: pixels.evidence.backgroundEstimate } : {}) },
    parameters: { maxExtensionPx, maxAngleAdjustmentDeg: 12, minReferenceWidthPx: 3, minCoverage: 0.9, apertureGuardPx: 3 },
    references, candidates, suggestions,
    limitation: 'Experimental straight neutral-stroke continuation only. Pixel continuity cannot distinguish every cabinet, furniture outline or annotation from a wall. Suggestions are not accepted geometry; curved walls, missing isolated walls, opening relocation and semantic conflicts are not resolved.' };
}
