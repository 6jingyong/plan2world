import type { DraftPoint } from './draft';
import { normalizeSourceWallGraph } from './sourceWallGraph';

export const SOURCE_WALL_TRACE_VERSION = 'source-wall-trace-v1' as const;
export const BARE_HOUSE_VERSION = 'bare-house-v1' as const;

export interface BareHouseBoundaryRef {
  wallId: string;
  reverse?: boolean;
}

export interface SourceWallTraceV1 {
  schemaVersion: typeof SOURCE_WALL_TRACE_VERSION;
  walls: { start: DraftPoint; end: DraftPoint; curvePoint?: DraftPoint }[];
  doorGaps?: { from: DraftPoint; to: DraftPoint }[];
}

export interface BareHouseV1 {
  schemaVersion: typeof BARE_HOUSE_VERSION;
  sourceSchemaVersion: typeof SOURCE_WALL_TRACE_VERSION;
  walls: { id: string; start: DraftPoint; end: DraftPoint; curvePoint?: DraftPoint }[];
  enclosures: { id: string; boundary: BareHouseBoundaryRef[] }[];
  sourceWallMap: Record<string, string[]>;
  junctions: { walls: string[]; point: DraftPoint; residualPx: number }[];
  virtualSplitCount: number;
  snappedEndpointCount: number;
  maxJunctionDistancePx: number;
  limitation: string;
}

function record(value: unknown, path: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, any>;
}
function finite(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be finite`);
  return value;
}
function point(value: unknown, path: string): DraftPoint {
  const item = record(value, path);
  const extras = Object.keys(item).filter(key => key !== 'x' && key !== 'y');
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
  return { x: finite(item.x, `${path}.x`), y: finite(item.y, `${path}.y`) };
}
function exactKeys(value: Record<string, any>, allowed: readonly string[], path: string) {
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
}

/** Convert evidence-only model output into the program-owned Bare House. */
export function buildBareHouse(input: unknown): BareHouseV1 {
  const trace = record(input, 'trace');
  exactKeys(trace, ['schemaVersion', 'walls', 'doorGaps'], 'trace');
  if (trace.schemaVersion !== SOURCE_WALL_TRACE_VERSION) {
    throw new Error(`source wall trace requires schemaVersion="${SOURCE_WALL_TRACE_VERSION}"`);
  }
  if (!Array.isArray(trace.walls) || trace.walls.length === 0) throw new Error('trace.walls must be a non-empty array');
  const walls = trace.walls.map((raw: unknown, index: number) => {
    const item = record(raw, `trace.walls[${index}]`);
    exactKeys(item, ['start', 'end', 'curvePoint'], `trace.walls[${index}]`);
    return {
      id: `w${index + 1}`,
      start: point(item.start, `trace.walls[${index}].start`),
      end: point(item.end, `trace.walls[${index}].end`),
      ...(item.curvePoint === undefined ? {} : { curvePoint: point(item.curvePoint, `trace.walls[${index}].curvePoint`) }),
    };
  });

  const rawDoorGaps = trace.doorGaps === undefined ? [] : trace.doorGaps;
  if (!Array.isArray(rawDoorGaps)) throw new Error('trace.doorGaps must be an array');
  const doorGaps = rawDoorGaps.map((raw: unknown, index: number) => {
    const item = record(raw, `trace.doorGaps[${index}]`);
    exactKeys(item, ['from', 'to'], `trace.doorGaps[${index}]`);
    return {
      id: `gap${index + 1}`,
      from: point(item.from, `trace.doorGaps[${index}].from`),
      to: point(item.to, `trace.doorGaps[${index}].to`),
    };
  });

  const normalized = normalizeSourceWallGraph({ walls, doorGaps });
  return { schemaVersion: BARE_HOUSE_VERSION, sourceSchemaVersion: SOURCE_WALL_TRACE_VERSION, ...normalized };
}
