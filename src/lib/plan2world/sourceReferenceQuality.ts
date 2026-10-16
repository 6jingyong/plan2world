import { draftToProject, parsePlan2WorldDraft, type DraftPoint, type DraftWall, type Plan2WorldDraft } from './draft';
import { inspectPlan2WorldDraftGeometry } from './geometryHealth';
import { planPointToSourcePixel, type TracePoint } from './reconstructionTrace';
import {
  assertSourceReferenceDimensions,
  parseSourceFloorPlanReference,
  type SourceFloorPlanReference,
  type SourceReferenceCoverage,
  type SourceReferenceLayer,
  type SourceReferenceOpening,
} from './sourceReference';
import { sourceBackgroundForRegistration, type SourceFloorPlanImage } from './sourceBackground';
import type { DirectionalWallQuality } from './reconstructionQuality';

const CURVE_FACETS = 16;

interface PixelSegment {
  start: TracePoint;
  end: TracePoint;
}

export interface SourceReferenceWallQuality {
  annotationCoverage: Exclude<SourceReferenceCoverage, 'none'>;
  tolerancePx: number;
  sampleSpacingPx: number;
  precision: number | null;
  recall: number;
  f1: number | null;
  referenceToCandidate: DirectionalWallQuality;
  candidateToReference: DirectionalWallQuality | null;
}

export interface SourceReferenceOpeningQuality {
  annotationCoverage: Exclude<SourceReferenceCoverage, 'none'>;
  tolerancePx: number;
  referenceCount: number;
  candidateCount: number;
  matchCount: number;
  precision: number | null;
  recall: number;
  f1: number | null;
  meanMatchErrorPx: number | null;
  p95MatchErrorPx: number | null;
}

export interface SourceReferenceTopologyQuality {
  referenceRoomCount: number | null;
  candidateRoomCount: number;
  roomCountDelta: number | null;
  candidateGeometryErrorCount: number;
  candidateGeometryWarningCount: number;
}

export interface SourceReferenceQualityReport {
  sourceWidth: number;
  sourceHeight: number;
  walls: SourceReferenceWallQuality | null;
  doors: SourceReferenceOpeningQuality | null;
  windows: SourceReferenceOpeningQuality | null;
  topology: SourceReferenceTopologyQuality;
}

function finiteSource(source: SourceFloorPlanImage): void {
  if (typeof source.dataUrl !== 'string' || !source.dataUrl.startsWith('data:image/')) {
    throw new Error('Reconstruction quality requires a source image data URL.');
  }
  if (!Number.isFinite(source.width) || source.width <= 0 || !Number.isFinite(source.height) || source.height <= 0) {
    throw new Error('Reconstruction quality requires positive source image dimensions.');
  }
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

function candidateProjection(draft: Plan2WorldDraft, source: SourceFloorPlanImage) {
  const registration = draft.sourceRegistration;
  if (!registration) throw new Error('Candidate reconstruction requires explicit source registration.');
  const floor = draft.floors.find(item => item.id === registration.floorId);
  if (!floor) throw new Error('Candidate reconstruction source registration does not resolve to a floor.');
  const background = sourceBackgroundForRegistration(draft, source, registration);
  if (!background) {
    throw new Error('Candidate reconstruction source registration is inconsistent; quality scoring will not use bounds fallback alignment.');
  }

  const segments = floor.walls.flatMap(wall => {
    const facets = wall.curvePoint ? CURVE_FACETS : 1;
    const points = Array.from({ length: facets + 1 }, (_, index) => (
      planPointToSourcePixel(wallPointAt(wall, index / facets), source, background)
    ));
    return points.slice(0, -1).map((start, index) => ({ start, end: points[index + 1] }));
  }).filter(segment => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 1e-9);

  if (!segments.length) throw new Error('Candidate reconstruction has no scoreable wall segments.');
  return { floor, background, segments };
}

function referenceWallSegments(reference: SourceFloorPlanReference): PixelSegment[] {
  const { width, height } = reference.source;
  return reference.walls.items.flatMap(wall => wall.points.slice(0, -1).map((point, index) => ({
    start: { x: point.x * width, y: point.y * height },
    end: { x: wall.points[index + 1].x * width, y: wall.points[index + 1].y * height },
  }))).filter(segment => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 1e-9);
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

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
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

function harmonicMean(a: number, b: number): number {
  return a + b > 0 ? 2 * a * b / (a + b) : 0;
}

function scoreWalls(
  reference: SourceFloorPlanReference,
  candidateSegments: PixelSegment[],
  tolerancePx: number,
  sampleSpacingPx: number,
): SourceReferenceWallQuality | null {
  if (reference.walls.coverage === 'none') return null;
  const segments = referenceWallSegments(reference);
  if (!segments.length) throw new Error('Source reference has no scoreable wall segments.');
  const referenceToCandidate = directionalWallQuality(sampleSegments(segments, sampleSpacingPx), candidateSegments, tolerancePx);

  if (reference.walls.coverage === 'partial') {
    return {
      annotationCoverage: 'partial',
      tolerancePx,
      sampleSpacingPx,
      precision: null,
      recall: referenceToCandidate.coverage,
      f1: null,
      referenceToCandidate,
      candidateToReference: null,
    };
  }

  const candidateToReference = directionalWallQuality(sampleSegments(candidateSegments, sampleSpacingPx), segments, tolerancePx);
  return {
    annotationCoverage: 'complete',
    tolerancePx,
    sampleSpacingPx,
    precision: candidateToReference.coverage,
    recall: referenceToCandidate.coverage,
    f1: harmonicMean(candidateToReference.coverage, referenceToCandidate.coverage),
    referenceToCandidate,
    candidateToReference,
  };
}

function candidateOpeningPoints(
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

function referenceOpeningPoints(
  layer: SourceReferenceLayer<SourceReferenceOpening>,
  reference: SourceFloorPlanReference,
): TracePoint[] {
  return layer.items.map(item => ({
    x: item.point.x * reference.source.width,
    y: item.point.y * reference.source.height,
  }));
}

function scoreOpenings(
  layer: SourceReferenceLayer<SourceReferenceOpening>,
  reference: SourceFloorPlanReference,
  candidate: TracePoint[],
  tolerancePx: number,
): SourceReferenceOpeningQuality | null {
  if (layer.coverage === 'none') return null;
  const referencePoints = referenceOpeningPoints(layer, reference);
  const pairs = referencePoints.flatMap((referencePoint, referenceIndex) => (
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

  const matchCount = matchedDistances.length;
  const recall = referencePoints.length === 0 ? 1 : matchCount / referencePoints.length;
  const complete = layer.coverage === 'complete';
  const precision = complete ? (candidate.length === 0 ? (referencePoints.length === 0 ? 1 : 0) : matchCount / candidate.length) : null;
  return {
    annotationCoverage: layer.coverage,
    tolerancePx,
    referenceCount: referencePoints.length,
    candidateCount: candidate.length,
    matchCount,
    precision,
    recall,
    f1: precision === null ? null : harmonicMean(precision, recall),
    meanMatchErrorPx: matchedDistances.length ? mean(matchedDistances) : null,
    p95MatchErrorPx: matchedDistances.length ? percentile95(matchedDistances) : null,
  };
}

function roomCount(draft: Plan2WorldDraft, floorId: string): number {
  const project = draftToProject(draft, new Date('2000-01-01T00:00:00.000Z'));
  return project.floors.find(floor => floor.id === floorId)?.rooms.length ?? 0;
}

/**
 * Score a reconstruction directly against normalized annotations on the source raster.
 * Partial annotations intentionally expose recall/error only: candidate precision and F1
 * would be invalid because unannotated geometry is not evidence of a false positive.
 */
export function scoreReconstructionAgainstSourceReference(
  candidateInput: unknown,
  referenceInput: unknown,
  source: SourceFloorPlanImage,
): SourceReferenceQualityReport {
  finiteSource(source);
  const reference = parseSourceFloorPlanReference(referenceInput);
  assertSourceReferenceDimensions(reference, source);
  const candidate = parsePlan2WorldDraft(candidateInput);
  const projection = candidateProjection(candidate, source);

  const minimumDimension = Math.min(source.width, source.height);
  const wallTolerancePx = Math.max(2, minimumDimension * 0.008);
  const sampleSpacingPx = Math.max(2, minimumDimension * 0.0075);
  const openingTolerancePx = Math.max(6, minimumDimension * 0.02);

  const findings = inspectPlan2WorldDraftGeometry(candidate);
  const candidateRoomCount = roomCount(candidate, projection.floor.id);
  const referenceRoomCount = reference.roomCount ?? null;

  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    walls: scoreWalls(reference, projection.segments, wallTolerancePx, sampleSpacingPx),
    doors: scoreOpenings(
      reference.doors,
      reference,
      candidateOpeningPoints(projection.floor, 'door', source, projection.background),
      openingTolerancePx,
    ),
    windows: scoreOpenings(
      reference.windows,
      reference,
      candidateOpeningPoints(projection.floor, 'window', source, projection.background),
      openingTolerancePx,
    ),
    topology: {
      referenceRoomCount,
      candidateRoomCount,
      roomCountDelta: referenceRoomCount === null ? null : candidateRoomCount - referenceRoomCount,
      candidateGeometryErrorCount: findings.filter(issue => issue.severity === 'error').length,
      candidateGeometryWarningCount: findings.filter(issue => issue.severity === 'warning').length,
    },
  };
}
