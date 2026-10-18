import type { Project } from '$lib/models/types';
import type { FloorAnalysis } from '$lib/utils/floorAnalysis';
import { parsePlan2WorldDraft, type DraftWall, type Plan2WorldDraft } from './draft';
import {
  inspectPlan2WorldDraftGeometry,
  inspectProjectGeometry,
  type DraftGeometryIssue,
} from './geometryHealth';

export interface DraftPlanExtent {
  width: number;
  depth: number;
}

export interface DraftReviewSummary {
  floorCount: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  scaleMode: Plan2WorldDraft['scale']['mode'];
  scaleConfidence: number;
  scaleBasis?: string;
  assumptions: string[];
  primaryExtent?: DraftPlanExtent;
  geometryIssues: DraftGeometryIssue[];
  geometryErrorCount: number;
  geometryWarningCount: number;
}

function wallSample(wall: DraftWall, t: number) {
  if (!wall.curvePoint) {
    return {
      x: wall.start.x + (wall.end.x - wall.start.x) * t,
      y: wall.start.y + (wall.end.y - wall.start.y) * t,
    };
  }
  const u = 1 - t;
  return {
    x: u * u * wall.start.x + 2 * u * t * wall.curvePoint.x + t * t * wall.end.x,
    y: u * u * wall.start.y + 2 * u * t * wall.curvePoint.y + t * t * wall.end.y,
  };
}

function primaryExtent(walls: DraftWall[]): DraftPlanExtent | undefined {
  if (walls.length === 0) return undefined;
  const points = walls.flatMap(wall => wall.curvePoint
    ? Array.from({ length: 17 }, (_, index) => wallSample(wall, index / 16))
    : [wall.start, wall.end]);
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
}

export function summarizePlan2WorldDraft(input: unknown): DraftReviewSummary {
  const draft = parsePlan2WorldDraft(input);
  const geometryIssues = inspectPlan2WorldDraftGeometry(draft);
  return {
    floorCount: draft.floors.length,
    wallCount: draft.floors.reduce((total, floor) => total + floor.walls.length, 0),
    doorCount: draft.floors.reduce((total, floor) => total + (floor.doors?.length ?? 0), 0),
    windowCount: draft.floors.reduce((total, floor) => total + (floor.windows?.length ?? 0), 0),
    scaleMode: draft.scale.mode,
    scaleConfidence: draft.scale.confidence,
    scaleBasis: draft.scale.basis,
    assumptions: [...(draft.assumptions ?? [])],
    primaryExtent: primaryExtent(draft.floors[0]?.walls ?? []),
    geometryIssues,
    geometryErrorCount: geometryIssues.filter(issue => issue.severity === 'error').length,
    geometryWarningCount: geometryIssues.filter(issue => issue.severity === 'warning').length,
  };
}

function positiveReference(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function scaled(value: number | undefined, factor: number): number | undefined {
  return value === undefined ? undefined : value * factor;
}

/**
 * Correct only plan-space scale. Vertical dimensions such as wall/door/window
 * heights and floor elevation are intentionally left unchanged: a 2D plan
 * calibration tells us horizontal scale, not storey height.
 */
export function calibratePlan2WorldDraft(
  input: unknown,
  reconstructedReferenceCm: number,
  actualReferenceCm: number,
): Plan2WorldDraft {
  const draft = parsePlan2WorldDraft(input);
  const reconstructed = positiveReference(reconstructedReferenceCm, 'Reconstructed reference length');
  const actual = positiveReference(actualReferenceCm, 'Actual reference length');
  const factor = actual / reconstructed;
  const previousBasis = draft.scale.basis ? ` Previous basis: ${draft.scale.basis}` : '';

  return {
    ...draft,
    scale: {
      mode: 'provided',
      confidence: 1,
      basis: `User calibration: ${reconstructed} cm reconstructed = ${actual} cm actual (${factor.toFixed(4)}×).${previousBasis}`,
    },
    floors: draft.floors.map(floor => ({
      ...floor,
      walls: floor.walls.map(wall => ({
        ...wall,
        start: { x: wall.start.x * factor, y: wall.start.y * factor },
        end: { x: wall.end.x * factor, y: wall.end.y * factor },
        curvePoint: wall.curvePoint
          ? { x: wall.curvePoint.x * factor, y: wall.curvePoint.y * factor }
          : undefined,
        thickness: scaled(wall.thickness, factor),
      })),
      doors: floor.doors?.map(door => ({ ...door, width: door.width * factor })),
      windows: floor.windows?.map(window => ({ ...window, width: window.width * factor })),
      floorAreas: floor.floorAreas?.map(area => ({ ...area, boundary: area.boundary.map(part =>
        'wallId' in part ? { ...part } : { point: { x: part.point.x * factor, y: part.point.y * factor },
          ...(part.curvePoint ? { curvePoint: { x: part.curvePoint.x * factor, y: part.curvePoint.y * factor } } : {}) }) })),
      furniture: floor.furniture?.map(item => ({
        ...item,
        position: { x: item.position.x * factor, y: item.position.y * factor },
        width: scaled(item.width, factor),
        depth: scaled(item.depth, factor),
      })),
    })),
  };
}

/** Historical confidence/scale evidence plus quantities and findings from the current Project. */
export function summarizeProjectReconstruction(project: Project, analyses?: Iterable<FloorAnalysis>): DraftReviewSummary | null {
  const evidence = project.reconstruction;
  if (!evidence) return null;
  const geometryIssues = inspectProjectGeometry(project, analyses);
  return {
    floorCount: project.floors.length,
    wallCount: project.floors.reduce((sum, floor) => sum + floor.walls.length, 0),
    doorCount: project.floors.reduce((sum, floor) => sum + floor.doors.length, 0),
    windowCount: project.floors.reduce((sum, floor) => sum + floor.windows.length, 0),
    scaleMode: evidence.scale.mode, scaleConfidence: evidence.scale.confidence, scaleBasis: evidence.scale.basis,
    assumptions: [...evidence.assumptions], primaryExtent: primaryExtent(project.floors[0]?.walls ?? []),
    geometryIssues, geometryErrorCount: geometryIssues.filter(issue => issue.severity === 'error').length,
    geometryWarningCount: geometryIssues.filter(issue => issue.severity === 'warning').length,
  };
}
