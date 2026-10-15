import type { Plan2WorldDraft } from './draft';
import { draftToProject } from './draft';

export type DraftTopologyIssueCode =
  | 'many-enclosed-regions'
  | 'high-region-wall-ratio'
  | 'many-tiny-regions';

export interface DraftTopologyIssue {
  code: DraftTopologyIssueCode;
  severity: 'warning';
  floorId: string;
  message: string;
}

export interface DraftTopologyFloorSummary {
  floorId: string;
  regionCount: number;
  tinyRegionCount: number;
  medianRegionArea: number;
  wallCount: number;
}

export interface DraftTopologyHealth {
  floors: DraftTopologyFloorSummary[];
  issues: DraftTopologyIssue[];
}

const MANY_REGIONS = 24;
const HIGH_RATIO_MIN_REGIONS = 16;
const HIGH_REGION_WALL_RATIO = 0.68;
const TINY_REGION_AREA_M2 = 1.5;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Look for structurally legal but suspicious room graphs after deterministic
 * room detection. These are review warnings, never automatic repairs: a large
 * home can legitimately contain many enclosed regions.
 */
export function inspectPlan2WorldDraftTopology(draft: Plan2WorldDraft): DraftTopologyHealth {
  const project = draftToProject(draft, new Date('2000-01-01T00:00:00.000Z'));
  const issues: DraftTopologyIssue[] = [];
  const floors: DraftTopologyFloorSummary[] = project.floors.map((floor, index) => {
    const sourceFloor = draft.floors[index];
    const areas = floor.rooms.map(room => room.area).filter(area => Number.isFinite(area) && area > 0);
    const regionCount = floor.rooms.length;
    const tinyRegionCount = areas.filter(area => area < TINY_REGION_AREA_M2).length;
    const wallCount = sourceFloor?.walls.length ?? floor.walls.length;
    const ratio = wallCount > 0 ? regionCount / wallCount : 0;

    if (regionCount >= MANY_REGIONS) {
      issues.push({
        code: 'many-enclosed-regions',
        severity: 'warning',
        floorId: floor.id,
        message: `${regionCount} enclosed regions were detected. This is unusually high for a single floor; check whether decorative or duplicate partitions split real rooms.`,
      });
    }

    if (regionCount >= HIGH_RATIO_MIN_REGIONS && ratio >= HIGH_REGION_WALL_RATIO) {
      issues.push({
        code: 'high-region-wall-ratio',
        severity: 'warning',
        floorId: floor.id,
        message: `${regionCount} regions from ${wallCount} walls is a dense face graph. The reconstruction may be over-segmented even if every wall is geometrically valid.`,
      });
    }

    const tinyLimit = Math.max(3, Math.ceil(regionCount * 0.15));
    if (tinyRegionCount >= tinyLimit) {
      issues.push({
        code: 'many-tiny-regions',
        severity: 'warning',
        floorId: floor.id,
        message: `${tinyRegionCount} detected regions are smaller than ${TINY_REGION_AREA_M2.toFixed(1)} m². Check for slivers or false partitions against the source image.`,
      });
    }

    return {
      floorId: floor.id,
      regionCount,
      tinyRegionCount,
      medianRegionArea: Math.round(median(areas) * 100) / 100,
      wallCount,
    };
  });

  return { floors, issues };
}
