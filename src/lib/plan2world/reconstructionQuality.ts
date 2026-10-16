import { draftToProject, parsePlan2WorldDraft, type DraftPoint, type DraftWall, type Plan2WorldDraft } from './draft';
import { inspectPlan2WorldDraftGeometry } from './geometryHealth';
import { planPointToSourcePixel, type TracePoint } from './reconstructionTrace';
import { sourceBackgroundForRegistration, type SourceFloorPlanImage } from './sourceBackground';

const CURVE_FACETS = 16;

interface PixelSegment {
  start: TracePoint;
  end: TracePoint;
}

export interface DirectionalWallQuality {
  sampleCount: number;
  coverage: number;
  meanErrorPx: number;
  p95ErrorPx: number;
}

export interface WallQuality {
  tolerancePx: number;
  sampleSpacingPx: number;
  precision: number;
  recall: number;
  f1: number;
  referenceToCandidate: DirectionalWallQuality;
  candidateToReference: DirectionalWallQuality;
}

export interface OpeningQuality {
  tolerancePx: number;
  referenceCount: number;
  candidateCount: number;
  matchCount: number;
  precision: number;
  recall: number;
  f1: number;
  meanMatchErrorPx: number | null;
  p95MatchErrorPx: number | null;
}

export interface TopologyQuality {
  referenceRoomCount: number;
  candidateRoomCount: number;
  roomCountDelta: number;
  candidateGeometryErrorCount: number;
  candidateGeometryWarningCount: number;
}

export interface ReconstructionQualityReport {
  sourceWidth: number;
  sourceHeight: number;
  walls: WallQuality;
  doors: OpeningQuality;
  windows: OpeningQuality;
  topology: TopologyQuality;
}

function finiteSource(source: SourceFloorPlanImage): void {
  if (typeof source.dataUrl !== 'string' || !source.dataUrl.startsWith('data:image/')) {
    throw new Error('Reconstruction quality requires a source image data URL.');
  }
  if (!Number.isFinite(source.width) || source.width <= 0 || !Number.isFinite(source.height) || source.height <= 0) {
    throw new Error('Reconstruction quality requires positive source image dimensions.');
  }
}

function registeredFloor(draft: Plan2WorldDraft, label: string) {
  const registration = draft.sourceRegistration;
  if (!registration) throw new Error(`${label} requires explicit source registration.`);
  const floor = draft.floors.find(item => item.id === registration.floorId);
  if (!floor) throw new Error(`${label} source registration does not resolve to a floor.`);
  return { floor, registration };
}

function wallPointAt(wall: DraftWall, t: number): DraftPoint {
  const clamped = Math.max(0, Math.min(1, t));
  if (!wall.curvePoint) {
    return {
      x: wall.start.x + (wall.end.x - wall.start.x) * clamped,
      y: wall.start.y + (wall.end.y - wall.start.y) * clamped,
    };
  }
  const u = 1 - clamped;
  return {
    x: u * u * wall.start.x + 2 * u * clamped * wall.curvePoint.x + clamped * clamped * wall.end.x,
    y: u * u * wall.start.y + 2 * u * clamped * wall.curvePoint.y + clamped * clamped * wall.end.y,
  };
}

function projectedWallSegments(
  draft: Plan2WorldDraft,
  source: SourceFloorPlanImage,
  label: string,
): { floor: Plan2WorldDraft['floors'][number]; segments: PixelSegment[]; background: NonNullable<ReturnType<typeof sourceBackgroundForRegistration>> } {
  const { floor, registration } = registeredFloor(draft, label);
  const background = sourceBackgroundForRegistration(draft, source, registration);
  if (!background) {
    throw new Error(`${label} source registration is inconsistent; quality scoring will not use bounds fallback alignment.`);
  }

  const segments = floor.walls.flatMap(wall => {
    const facets = wall.curvePoint ? CURVE_FACETS : 1;
    const points = Array.from({ length: facets + 1 }, (_, index) => (
      planPointToSourcePixel(wallPointAt(wall, index / facets), source, background)
    ));
    return points.slice(0, -1).map((start, index) => ({ start, end: points[index + 1] }));
  }).filter(segment => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 1e-9);

  if (!segments.length) throw new Error(`${label} has no scoreable wall segments.`);
  return { floor, segments, background };
}

function pointSegmentDistance(point: TracePoint, segment: PixelSegment): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-12) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y);
  const t = Math.max(0, Math.min(1,
    ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSq,
  ));
  return Math.hypot(
    point.x - (segment.start.x + dx * t),
    point.y - (segment.start.y + dy * t),
  );
}

function sampleSegments(segments: PixelSegment[], spacingPx: number): TracePoint[] {
  return segments.flatMap(segment => {
    const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
    const count = Math.max(1, Math.ceil(length / spacingPx));
    return Array.from({ length: count }, (_, index) => {
      const t = (index + 0.5) / count;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t,
      };
    });
  });
}

function percentile95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function directionalWallQuality(
  samples: TracePoint[],
  targetSegments: PixelSegment[],
  tolerancePx: number,
): DirectionalWallQuality {
  const distances = samples.map(point => Math.min(...targetSegments.map(segment => pointSegmentDistance(point, segment))));
  return {
    sampleCount: samples.length,
    coverage: distances.filter(distance => distance <= tolerancePx).length / samples.length,
    meanErrorPx: mean(distances),
    p95ErrorPx: percentile95(distances),
  };
}

function prf(referenceCount: number, candidateCount: number, matchCount: number) {
  if (referenceCount === 0 && candidateCount === 0) return { precision: 1, recall: 1, f1: 1 };
  const precision = candidateCount > 0 ? matchCount / candidateCount : 0;
  const recall = referenceCount > 0 ? matchCount / referenceCount : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function openingPoints(
  floor: Plan2WorldDraft['floors'][number],
  kind: 'door' | 'window',
  source: SourceFloorPlanImage,
  background: NonNullable<ReturnType<typeof sourceBackgroundForRegistration>>,
): TracePoint[] {
  const walls = new Map(floor.walls.map(wall => [wall.id, wall]));
  const openings = kind === 'door' ? (floor.doors ?? []) : (floor.windows ?? []);
  return openings.flatMap(opening => {
    const wall = walls.get(opening.wallId);
    if (!wall) return [];
    return [planPointToSourcePixel(wallPointAt(wall, opening.position), source, background)];
  });
}

function scoreOpenings(reference: TracePoint[], candidate: TracePoint[], tolerancePx: number): OpeningQuality {
  const pairs = reference.flatMap((referencePoint, referenceIndex) => (
    candidate.map((candidatePoint, candidateIndex) => ({
      referenceIndex,
      candidateIndex,
      distance: Math.hypot(referencePoint.x - candidatePoint.x, referencePoint.y - candidatePoint.y),
    }))
  )).filter(pair => pair.distance <= tolerancePx).sort((a, b) => a.distance - b.distance);

  const usedReference = new Set<number>();
  const usedCandidate = new Set<number>();
  const matchedDistances: number[] = [];
  for (const pair of pairs) {
    if (usedReference.has(pair.referenceIndex) || usedCandidate.has(pair.candidateIndex)) continue;
    usedReference.add(pair.referenceIndex);
    usedCandidate.add(pair.candidateIndex);
    matchedDistances.push(pair.distance);
  }

  const scores = prf(reference.length, candidate.length, matchedDistances.length);
  return {
    tolerancePx,
    referenceCount: reference.length,
    candidateCount: candidate.length,
    matchCount: matchedDistances.length,
    ...scores,
    meanMatchErrorPx: matchedDistances.length ? mean(matchedDistances) : null,
    p95MatchErrorPx: matchedDistances.length ? percentile95(matchedDistances) : null,
  };
}

function roomCount(draft: Plan2WorldDraft, floorId: string): number {
  const project = draftToProject(draft, new Date('2000-01-01T00:00:00.000Z'));
  return project.floors.find(floor => floor.id === floorId)?.rooms.length ?? 0;
}

/**
 * Compare two reconstructions in their common source-image coordinate system.
 * Explicit source registration is mandatory: evaluation must never make a bad
 * reconstruction look better by independently fitting its wall bounds to the raster.
 *
 * The report deliberately exposes orthogonal metrics instead of a composite score.
 * Weighting can be chosen later once the real-plan corpus is large enough to justify it.
 */
export function scoreReconstructionAgainstReference(
  referenceInput: unknown,
  candidateInput: unknown,
  source: SourceFloorPlanImage,
): ReconstructionQualityReport {
  finiteSource(source);
  const reference = parsePlan2WorldDraft(referenceInput);
  const candidate = parsePlan2WorldDraft(candidateInput);
  const referenceProjection = projectedWallSegments(reference, source, 'Reference reconstruction');
  const candidateProjection = projectedWallSegments(candidate, source, 'Candidate reconstruction');

  const minimumDimension = Math.min(source.width, source.height);
  const wallTolerancePx = Math.max(2, minimumDimension * 0.008);
  const sampleSpacingPx = Math.max(2, minimumDimension * 0.0075);
  const openingTolerancePx = Math.max(6, minimumDimension * 0.02);

  const referenceSamples = sampleSegments(referenceProjection.segments, sampleSpacingPx);
  const candidateSamples = sampleSegments(candidateProjection.segments, sampleSpacingPx);
  const referenceToCandidate = directionalWallQuality(referenceSamples, candidateProjection.segments, wallTolerancePx);
  const candidateToReference = directionalWallQuality(candidateSamples, referenceProjection.segments, wallTolerancePx);
  const wallScores = prf(referenceSamples.length, candidateSamples.length,
    0); // Precision/recall below use length-weighted coverage rather than discrete sample identity.
  wallScores.precision = candidateToReference.coverage;
  wallScores.recall = referenceToCandidate.coverage;
  wallScores.f1 = wallScores.precision + wallScores.recall > 0
    ? 2 * wallScores.precision * wallScores.recall / (wallScores.precision + wallScores.recall)
    : 0;

  const referenceDoors = openingPoints(referenceProjection.floor, 'door', source, referenceProjection.background);
  const candidateDoors = openingPoints(candidateProjection.floor, 'door', source, candidateProjection.background);
  const referenceWindows = openingPoints(referenceProjection.floor, 'window', source, referenceProjection.background);
  const candidateWindows = openingPoints(candidateProjection.floor, 'window', source, candidateProjection.background);

  const findings = inspectPlan2WorldDraftGeometry(candidate);
  const referenceRoomCount = roomCount(reference, referenceProjection.floor.id);
  const candidateRoomCount = roomCount(candidate, candidateProjection.floor.id);

  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    walls: {
      tolerancePx: wallTolerancePx,
      sampleSpacingPx,
      precision: wallScores.precision,
      recall: wallScores.recall,
      f1: wallScores.f1,
      referenceToCandidate,
      candidateToReference,
    },
    doors: scoreOpenings(referenceDoors, candidateDoors, openingTolerancePx),
    windows: scoreOpenings(referenceWindows, candidateWindows, openingTolerancePx),
    topology: {
      referenceRoomCount,
      candidateRoomCount,
      roomCountDelta: candidateRoomCount - referenceRoomCount,
      candidateGeometryErrorCount: findings.filter(issue => issue.severity === 'error').length,
      candidateGeometryWarningCount: findings.filter(issue => issue.severity === 'warning').length,
    },
  };
}
