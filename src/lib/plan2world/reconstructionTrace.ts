import type { BackgroundImage } from '$lib/models/types';
import {
  parsePlan2WorldDraft,
  type DraftDoor,
  type DraftPoint,
  type DraftWall,
  type DraftWindow,
  type Plan2WorldDraft,
} from './draft';
import { inspectPlan2WorldDraftGeometry, type DraftGeometryIssueSeverity } from './geometryHealth';
import { sourceBackgroundForDraft, type SourceFloorPlanImage } from './sourceBackground';

export interface TracePoint { x: number; y: number }
export interface ReconstructionTraceWall {
  id: string;
  start: TracePoint;
  end: TracePoint;
  curvePoint?: TracePoint;
  kind: DraftWall['kind'];
  confidence?: number;
  severity?: DraftGeometryIssueSeverity;
}
export interface ReconstructionTraceOpening {
  id: string;
  wallId: string;
  kind: 'door' | 'window';
  point: TracePoint;
  confidence?: number;
  severity?: DraftGeometryIssueSeverity;
}
export interface ReconstructionTrace {
  width: number;
  height: number;
  walls: ReconstructionTraceWall[];
  openings: ReconstructionTraceOpening[];
}

function severityByElement(draft: Plan2WorldDraft): Map<string, DraftGeometryIssueSeverity> {
  const severity = new Map<string, DraftGeometryIssueSeverity>();
  for (const issue of inspectPlan2WorldDraftGeometry(draft)) {
    for (const id of issue.elementIds) {
      if (issue.severity === 'error' || !severity.has(id)) severity.set(id, issue.severity);
    }
  }
  return severity;
}

/** Invert the exact background-image similarity transform used by the editor. */
export function planPointToSourcePixel(
  point: DraftPoint,
  source: SourceFloorPlanImage,
  background: BackgroundImage,
): TracePoint {
  const angle = background.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - background.position.x;
  const dy = point.y - background.position.y;
  const centeredX = (cos * dx + sin * dy) / background.scale;
  const centeredY = (-sin * dx + cos * dy) / background.scale;
  return {
    x: centeredX + source.width / 2,
    y: centeredY + source.height / 2,
  };
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

function openingTrace(
  opening: DraftDoor | DraftWindow,
  kind: 'door' | 'window',
  walls: Map<string, DraftWall>,
  source: SourceFloorPlanImage,
  background: BackgroundImage,
  severities: Map<string, DraftGeometryIssueSeverity>,
): ReconstructionTraceOpening | null {
  const wall = walls.get(opening.wallId);
  if (!wall) return null;
  return {
    id: opening.id,
    wallId: opening.wallId,
    kind,
    point: planPointToSourcePixel(wallPointAt(wall, opening.position), source, background),
    confidence: opening.confidence,
    severity: severities.get(opening.id) ?? severities.get(opening.wallId),
  };
}

/**
 * Project the current reconstruction back onto its original source raster.
 * This is review-only visualization: it never edits or repairs geometry.
 */
export function buildReconstructionTrace(
  input: unknown,
  source: SourceFloorPlanImage,
): ReconstructionTrace | undefined {
  const draft = parsePlan2WorldDraft(input);
  const background = sourceBackgroundForDraft(draft, source);
  if (!background) return undefined;
  const floor = draft.floors.find(item => item.id === draft.sourceRegistration?.floorId) ?? draft.floors[0];
  if (!floor) return undefined;

  const severities = severityByElement(draft);
  const wallsById = new Map(floor.walls.map(wall => [wall.id, wall]));
  const walls = floor.walls.map(wall => ({
    id: wall.id,
    start: planPointToSourcePixel(wall.start, source, background),
    end: planPointToSourcePixel(wall.end, source, background),
    curvePoint: wall.curvePoint ? planPointToSourcePixel(wall.curvePoint, source, background) : undefined,
    kind: wall.kind,
    confidence: wall.confidence,
    severity: severities.get(wall.id),
  }));
  const openings = [
    ...(floor.doors ?? []).map(item => openingTrace(item, 'door', wallsById, source, background, severities)),
    ...(floor.windows ?? []).map(item => openingTrace(item, 'window', wallsById, source, background, severities)),
  ].filter((item): item is ReconstructionTraceOpening => item !== null);

  return { width: source.width, height: source.height, walls, openings };
}
