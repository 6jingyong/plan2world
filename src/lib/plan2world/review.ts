import { parsePlan2WorldDraft, type Plan2WorldDraft } from './draft';
import {
  inspectPlan2WorldDraftGeometry,
  type DraftGeometryIssue,
} from './geometryHealth';
import {
  inspectPlan2WorldDraftTopology,
  type DraftTopologyIssue,
} from './topologyHealth';

export interface DraftPlanExtent {
  width: number;
  depth: number;
}

export interface DraftReviewSummary {
  floorCount: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  regionCount: number;
  tinyRegionCount: number;
  scaleMode: Plan2WorldDraft['scale']['mode'];
  scaleConfidence: number;
  scaleBasis?: string;
  assumptions: string[];
  primaryExtent?: DraftPlanExtent;
  geometryIssues: DraftGeometryIssue[];
  geometryErrorCount: number;
  geometryWarningCount: number;
  topologyIssues: DraftTopologyIssue[];
  topologyWarningCount: number;
}

function primaryExtent(draft: Plan2WorldDraft): DraftPlanExtent | undefined {
  const walls = draft.floors[0]?.walls ?? [];
  if (walls.length === 0) return undefined;
  const xs = walls.flatMap(wall => [wall.start.x, wall.end.x]);
  const ys = walls.flatMap(wall => [wall.start.y, wall.end.y]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
}

export function summarizePlan2WorldDraft(input: unknown): DraftReviewSummary {
  const draft = parsePlan2WorldDraft(input);
  const geometryIssues = inspectPlan2WorldDraftGeometry(draft);
  const topology = inspectPlan2WorldDraftTopology(draft);
  return {
    floorCount: draft.floors.length,
    wallCount: draft.floors.reduce((total, floor) => total + floor.walls.length, 0),
    doorCount: draft.floors.reduce((total, floor) => total + (floor.doors?.length ?? 0), 0),
    windowCount: draft.floors.reduce((total, floor) => total + (floor.windows?.length ?? 0), 0),
    regionCount: topology.floors.reduce((total, floor) => total + floor.regionCount, 0),
    tinyRegionCount: topology.floors.reduce((total, floor) => total + floor.tinyRegionCount, 0),
    scaleMode: draft.scale.mode,
    scaleConfidence: draft.scale.confidence,
    scaleBasis: draft.scale.basis,
    assumptions: [...(draft.assumptions ?? [])],
    primaryExtent: primaryExtent(draft),
    geometryIssues,
    geometryErrorCount: geometryIssues.filter(issue => issue.severity === 'error').length,
    geometryWarningCount: geometryIssues.filter(issue => issue.severity === 'warning').length,
    topologyIssues: topology.issues,
    topologyWarningCount: topology.issues.length,
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
        thickness: scaled(wall.thickness, factor),
      })),
      doors: floor.doors?.map(door => ({ ...door, width: door.width * factor })),
      windows: floor.windows?.map(window => ({ ...window, width: window.width * factor })),
      furniture: floor.furniture?.map(item => ({
        ...item,
        position: { x: item.position.x * factor, y: item.position.y * factor },
      })),
    })),
  };
}
