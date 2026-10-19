import type { DraftPoint, DraftWall } from './draft';
import { normalizeSourceWallGraph } from './sourceWallGraph';

export const SOURCE_WALL_TRACE_VERSION = 'source-wall-trace-v1' as const;
export const BARE_HOUSE_VERSION = 'bare-house-v1' as const;

export interface BareHouseBoundaryRef {
  wallId: string;
  reverse?: boolean;
}

export interface SourceWallTraceV1 {
  schemaVersion: typeof SOURCE_WALL_TRACE_VERSION;
  maxJunctionDistancePx?: number;
  walls: DraftWall[];
  /** Source-observed wall interruptions; the normalizer resolves their wall hosts. */
  doorGaps?: { id: string; from: DraftPoint; to: DraftPoint }[];
  enclosures?: {
    id: string;
    boundary: BareHouseBoundaryRef[];
  }[];
}

export interface BareHouseV1 {
  schemaVersion: typeof BARE_HOUSE_VERSION;
  sourceSchemaVersion: typeof SOURCE_WALL_TRACE_VERSION;
  walls: DraftWall[];
  enclosures: {
    id: string;
    boundary: BareHouseBoundaryRef[];
  }[];
  sourceWallMap: Record<string, string[]>;
  junctions: {
    walls: string[];
    point: DraftPoint;
    residualPx: number;
  }[];
  virtualSplitCount: number;
  snappedEndpointCount: number;
  maxJunctionDistancePx: number;
  limitation: string;
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, any>;
}

/** Convert image-model wall evidence into the program-owned geometry artifact. */
export function buildBareHouse(input: unknown): BareHouseV1 {
  const trace = record(input);
  if (trace.schemaVersion !== SOURCE_WALL_TRACE_VERSION) {
    throw new Error(`source wall trace requires schemaVersion="${SOURCE_WALL_TRACE_VERSION}"`);
  }

  const normalized = normalizeSourceWallGraph({
    doorGaps: trace.doorGaps,
    maxJunctionDistancePx: trace.maxJunctionDistancePx,
    walls: trace.walls,
    enclosures: trace.enclosures,
  });

  return {
    schemaVersion: BARE_HOUSE_VERSION,
    sourceSchemaVersion: SOURCE_WALL_TRACE_VERSION,
    ...normalized,
  };
}
