export const PLAN2WORLD_SOURCE_REFERENCE_VERSION = 'plan2world-source-reference-v1' as const;

export type SourceReferenceCoverage = 'complete' | 'partial' | 'none';

export interface SourceReferencePoint {
  x: number;
  y: number;
}

export interface SourceReferenceWall {
  id: string;
  /** Ordered centerline points, normalized to 0..1 from the source image top-left. */
  points: SourceReferencePoint[];
}

export interface SourceReferenceOpening {
  id: string;
  /** Opening center, normalized to 0..1 from the source image top-left. */
  point: SourceReferencePoint;
}

export interface SourceReferenceLayer<T> {
  coverage: SourceReferenceCoverage;
  items: T[];
}

export interface SourceFloorPlanReference {
  schemaVersion: typeof PLAN2WORLD_SOURCE_REFERENCE_VERSION;
  source: {
    width: number;
    height: number;
    sha256?: string;
  };
  walls: SourceReferenceLayer<SourceReferenceWall>;
  doors: SourceReferenceLayer<SourceReferenceOpening>;
  windows: SourceReferenceLayer<SourceReferenceOpening>;
  roomCount?: number;
  notes?: string[];
}

export class SourceFloorPlanReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceFloorPlanReferenceError';
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SourceFloorPlanReferenceError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SourceFloorPlanReferenceError(`${path} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new SourceFloorPlanReferenceError(`${path} must be a positive integer`);
  }
  return value;
}

function normalizedPoint(value: unknown, path: string): SourceReferencePoint {
  const item = record(value, path);
  if (typeof item.x !== 'number' || !Number.isFinite(item.x)
    || typeof item.y !== 'number' || !Number.isFinite(item.y)
    || item.x < 0 || item.x > 1 || item.y < 0 || item.y > 1) {
    throw new SourceFloorPlanReferenceError(`${path} coordinates must be finite numbers between 0 and 1`);
  }
  return { x: item.x, y: item.y };
}

function coverage(value: unknown, path: string): SourceReferenceCoverage {
  if (value !== 'complete' && value !== 'partial' && value !== 'none') {
    throw new SourceFloorPlanReferenceError(`${path} must be complete, partial, or none`);
  }
  return value;
}

function uniqueIds(items: { id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new SourceFloorPlanReferenceError(`${path} contains duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function parseWall(value: unknown, path: string): SourceReferenceWall {
  const item = record(value, path);
  if (!Array.isArray(item.points) || item.points.length < 2) {
    throw new SourceFloorPlanReferenceError(`${path}.points must contain at least two points`);
  }
  return {
    id: nonEmptyString(item.id, `${path}.id`),
    points: item.points.map((point, index) => normalizedPoint(point, `${path}.points[${index}]`)),
  };
}

function parseOpening(value: unknown, path: string): SourceReferenceOpening {
  const item = record(value, path);
  return {
    id: nonEmptyString(item.id, `${path}.id`),
    point: normalizedPoint(item.point, `${path}.point`),
  };
}

function parseLayer<T extends { id: string }>(
  value: unknown,
  path: string,
  parseItem: (value: unknown, path: string) => T,
  requireCompleteItems: boolean,
): SourceReferenceLayer<T> {
  const item = record(value, path);
  const layerCoverage = coverage(item.coverage, `${path}.coverage`);
  if (!Array.isArray(item.items)) throw new SourceFloorPlanReferenceError(`${path}.items must be an array`);
  const items = item.items.map((entry, index) => parseItem(entry, `${path}.items[${index}]`));
  uniqueIds(items, path);
  if (layerCoverage === 'none' && items.length > 0) {
    throw new SourceFloorPlanReferenceError(`${path}.items must be empty when coverage is none`);
  }
  if (layerCoverage === 'partial' && items.length === 0) {
    throw new SourceFloorPlanReferenceError(`${path}.items must not be empty when coverage is partial`);
  }
  if (layerCoverage === 'complete' && requireCompleteItems && items.length === 0) {
    throw new SourceFloorPlanReferenceError(`${path}.items must not be empty when coverage is complete`);
  }
  return { coverage: layerCoverage, items };
}

function emptyOpeningLayer(): SourceReferenceLayer<SourceReferenceOpening> {
  return { coverage: 'none', items: [] };
}

export function parseSourceFloorPlanReference(input: unknown): SourceFloorPlanReference {
  const root = record(input, 'reference');
  if (root.schemaVersion !== PLAN2WORLD_SOURCE_REFERENCE_VERSION) {
    throw new SourceFloorPlanReferenceError(`reference.schemaVersion must be ${PLAN2WORLD_SOURCE_REFERENCE_VERSION}`);
  }

  const source = record(root.source, 'reference.source');
  const width = positiveInteger(source.width, 'reference.source.width');
  const height = positiveInteger(source.height, 'reference.source.height');
  let sha256: string | undefined;
  if (source.sha256 !== undefined) {
    sha256 = nonEmptyString(source.sha256, 'reference.source.sha256').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new SourceFloorPlanReferenceError('reference.source.sha256 must be a 64-character hexadecimal SHA-256');
    }
  }

  const walls = parseLayer(root.walls, 'reference.walls', parseWall, true);
  const doors = root.doors === undefined
    ? emptyOpeningLayer()
    : parseLayer(root.doors, 'reference.doors', parseOpening, false);
  const windows = root.windows === undefined
    ? emptyOpeningLayer()
    : parseLayer(root.windows, 'reference.windows', parseOpening, false);

  let roomCount: number | undefined;
  if (root.roomCount !== undefined) {
    if (typeof root.roomCount !== 'number' || !Number.isInteger(root.roomCount) || root.roomCount < 0) {
      throw new SourceFloorPlanReferenceError('reference.roomCount must be a non-negative integer');
    }
    roomCount = root.roomCount;
  }

  let notes: string[] | undefined;
  if (root.notes !== undefined) {
    if (!Array.isArray(root.notes)) throw new SourceFloorPlanReferenceError('reference.notes must be an array');
    notes = root.notes.map((note, index) => nonEmptyString(note, `reference.notes[${index}]`));
  }

  return {
    schemaVersion: PLAN2WORLD_SOURCE_REFERENCE_VERSION,
    source: { width, height, sha256 },
    walls,
    doors,
    windows,
    roomCount,
    notes,
  };
}

export function assertSourceReferenceDimensions(
  reference: SourceFloorPlanReference,
  source: { width: number; height: number },
): void {
  if (source.width !== reference.source.width || source.height !== reference.source.height) {
    throw new SourceFloorPlanReferenceError(
      `Source image dimensions ${source.width}x${source.height} do not match reference ${reference.source.width}x${reference.source.height}`,
    );
  }
}
