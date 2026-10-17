import type { Door, Floor, FurnitureItem, Project, Wall, Window } from '$lib/models/types';
import { resolveRooms } from '$lib/utils/roomDetection';

export const PLAN2WORLD_DRAFT_VERSION = 'plan2world-draft-v1' as const;

export interface DraftPoint { x: number; y: number }
export type DraftScaleMode = 'measured' | 'provided' | 'estimated';

export interface DraftScale {
  mode: DraftScaleMode;
  confidence: number;
  basis?: string;
}

export interface DraftSourceAnchor {
  wallId: string;
  endpoint: 'start' | 'end';
  /** Source-image coordinates normalized to 0..1 from the top-left corner. */
  image: DraftPoint;
}

export interface DraftSourceRegistration {
  floorId: string;
  confidence: number;
  anchors: DraftSourceAnchor[];
}

export interface DraftWall {
  id: string;
  start: DraftPoint;
  end: DraftPoint;
  /** Optional quadratic Bezier control point. Missing means a straight wall. */
  curvePoint?: DraftPoint;
  thickness?: number;
  height?: number;
  kind?: 'interior' | 'exterior' | 'unknown';
  confidence?: number;
}

export interface DraftDoor {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height?: number;
  type?: Door['type'];
  swingDirection?: Door['swingDirection'];
  flipSide?: boolean;
  confidence?: number;
}

export interface DraftWindow {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height?: number;
  sillHeight?: number;
  type?: Window['type'];
  confidence?: number;
}

export interface DraftFurniture {
  id: string;
  catalogId: string;
  position: DraftPoint;
  rotation?: number;
  confidence?: number;
}

export interface DraftFloor {
  id: string;
  name: string;
  level: number;
  elevation?: number;
  walls: DraftWall[];
  doors?: DraftDoor[];
  windows?: DraftWindow[];
  furniture?: DraftFurniture[];
}

export interface Plan2WorldDraft {
  schemaVersion: typeof PLAN2WORLD_DRAFT_VERSION;
  name: string;
  units: 'cm';
  scale: DraftScale;
  assumptions?: string[];
  /** Optional image-to-plan registration metadata. It is advisory and never required to import a draft. */
  sourceRegistration?: DraftSourceRegistration;
  floors: DraftFloor[];
}

const DEFAULTS = {
  wallHeight: 280,
  interiorWallThickness: 12,
  exteriorWallThickness: 20,
  doorHeight: 210,
  windowHeight: 120,
  windowSillHeight: 90,
} as const;

export class Plan2WorldDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Plan2WorldDraftError';
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Plan2WorldDraftError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Plan2WorldDraftError(`${path} must be a non-empty string`);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Plan2WorldDraftError(`${path} must be a finite number`);
  }
  return value;
}

function positive(value: unknown, path: string): number {
  const n = finite(value, path);
  if (n <= 0) throw new Plan2WorldDraftError(`${path} must be greater than zero`);
  return n;
}

function optionalPositive(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : positive(value, path);
}

function confidence(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  const n = finite(value, path);
  if (n < 0 || n > 1) throw new Plan2WorldDraftError(`${path} must be between 0 and 1`);
  return n;
}

function point(value: unknown, path: string): DraftPoint {
  const v = record(value, path);
  return { x: finite(v.x, `${path}.x`), y: finite(v.y, `${path}.y`) };
}

function normalizedPoint(value: unknown, path: string): DraftPoint {
  const p = point(value, path);
  if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
    throw new Plan2WorldDraftError(`${path} coordinates must be between 0 and 1`);
  }
  return p;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T, path: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Plan2WorldDraftError(`${path} has an unsupported value`);
  }
  return value as T;
}

function uniqueIds(items: { id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Plan2WorldDraftError(`${path} contains duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function parseWall(value: unknown, path: string): DraftWall {
  const v = record(value, path);
  const kind = v.kind === undefined
    ? undefined
    : enumValue(v.kind, ['interior', 'exterior', 'unknown'] as const, 'unknown', `${path}.kind`);
  return {
    id: stringValue(v.id, `${path}.id`),
    start: point(v.start, `${path}.start`),
    end: point(v.end, `${path}.end`),
    curvePoint: v.curvePoint === undefined ? undefined : point(v.curvePoint, `${path}.curvePoint`),
    thickness: optionalPositive(v.thickness, `${path}.thickness`),
    height: optionalPositive(v.height, `${path}.height`),
    kind,
    confidence: confidence(v.confidence, `${path}.confidence`),
  };
}

function parseDoor(value: unknown, path: string): DraftDoor {
  const v = record(value, path);
  const position = finite(v.position, `${path}.position`);
  if (position < 0 || position > 1) throw new Plan2WorldDraftError(`${path}.position must be between 0 and 1`);
  return {
    id: stringValue(v.id, `${path}.id`),
    wallId: stringValue(v.wallId, `${path}.wallId`),
    position,
    width: positive(v.width, `${path}.width`),
    height: optionalPositive(v.height, `${path}.height`),
    type: v.type === undefined ? undefined : enumValue(v.type, ['single', 'double', 'sliding', 'french', 'pocket', 'bifold', 'opening', 'garage'] as const, 'single', `${path}.type`),
    swingDirection: v.swingDirection === undefined ? undefined : enumValue(v.swingDirection, ['left', 'right'] as const, 'left', `${path}.swingDirection`),
    flipSide: v.flipSide === undefined ? undefined : Boolean(v.flipSide),
    confidence: confidence(v.confidence, `${path}.confidence`),
  };
}

function parseWindow(value: unknown, path: string): DraftWindow {
  const v = record(value, path);
  const position = finite(v.position, `${path}.position`);
  if (position < 0 || position > 1) throw new Plan2WorldDraftError(`${path}.position must be between 0 and 1`);
  return {
    id: stringValue(v.id, `${path}.id`),
    wallId: stringValue(v.wallId, `${path}.wallId`),
    position,
    width: positive(v.width, `${path}.width`),
    height: optionalPositive(v.height, `${path}.height`),
    sillHeight: v.sillHeight === undefined ? undefined : finite(v.sillHeight, `${path}.sillHeight`),
    type: v.type === undefined ? undefined : enumValue(v.type, ['standard', 'fixed', 'casement', 'sliding', 'bay'] as const, 'standard', `${path}.type`),
    confidence: confidence(v.confidence, `${path}.confidence`),
  };
}

function parseFurniture(value: unknown, path: string): DraftFurniture {
  const v = record(value, path);
  return {
    id: stringValue(v.id, `${path}.id`),
    catalogId: stringValue(v.catalogId, `${path}.catalogId`),
    position: point(v.position, `${path}.position`),
    rotation: v.rotation === undefined ? undefined : finite(v.rotation, `${path}.rotation`),
    confidence: confidence(v.confidence, `${path}.confidence`),
  };
}

function parseFloor(value: unknown, index: number): DraftFloor {
  const path = `floors[${index}]`;
  const v = record(value, path);
  if (!Number.isInteger(v.level)) throw new Plan2WorldDraftError(`${path}.level must be an integer`);
  if (!Array.isArray(v.walls) || v.walls.length === 0) throw new Plan2WorldDraftError(`${path}.walls must contain at least one wall`);

  const walls = v.walls.map((item, i) => parseWall(item, `${path}.walls[${i}]`));
  const doors = Array.isArray(v.doors) ? v.doors.map((item, i) => parseDoor(item, `${path}.doors[${i}]`)) : [];
  const windows = Array.isArray(v.windows) ? v.windows.map((item, i) => parseWindow(item, `${path}.windows[${i}]`)) : [];
  const furniture = Array.isArray(v.furniture) ? v.furniture.map((item, i) => parseFurniture(item, `${path}.furniture[${i}]`)) : [];

  uniqueIds(walls, `${path}.walls`);
  uniqueIds(doors, `${path}.doors`);
  uniqueIds(windows, `${path}.windows`);
  uniqueIds(furniture, `${path}.furniture`);

  const wallIds = new Set(walls.map(w => w.id));
  for (const opening of [...doors, ...windows]) {
    if (!wallIds.has(opening.wallId)) {
      throw new Plan2WorldDraftError(`${path}: opening ${opening.id} references unknown wall ${opening.wallId}`);
    }
  }

  return {
    id: stringValue(v.id, `${path}.id`),
    name: stringValue(v.name, `${path}.name`),
    level: v.level as number,
    elevation: v.elevation === undefined ? undefined : finite(v.elevation, `${path}.elevation`),
    walls,
    doors,
    windows,
    furniture,
  };
}

/** Registration is optional advisory metadata. Ignore malformed registration rather than rejecting valid geometry. */
function parseSourceRegistration(value: unknown, floors: DraftFloor[]): DraftSourceRegistration | undefined {
  if (value === undefined) return undefined;
  try {
    const v = record(value, 'sourceRegistration');
    const floorId = stringValue(v.floorId, 'sourceRegistration.floorId');
    const floor = floors.find(item => item.id === floorId);
    if (!floor) throw new Plan2WorldDraftError('sourceRegistration.floorId must refer to a draft floor');
    const registrationConfidence = confidence(v.confidence, 'sourceRegistration.confidence');
    if (registrationConfidence === undefined) throw new Plan2WorldDraftError('sourceRegistration.confidence is required');
    if (!Array.isArray(v.anchors)) throw new Plan2WorldDraftError('sourceRegistration.anchors must be an array');
    const walls = new Set(floor.walls.map(wall => wall.id));
    const seen = new Set<string>();
    const anchors: DraftSourceAnchor[] = [];
    for (const [index, raw] of v.anchors.entries()) {
      const path = `sourceRegistration.anchors[${index}]`;
      const anchor = record(raw, path);
      const wallId = stringValue(anchor.wallId, `${path}.wallId`);
      if (!walls.has(wallId)) throw new Plan2WorldDraftError(`${path}.wallId must refer to a wall on the registration floor`);
      const endpoint = enumValue(anchor.endpoint, ['start', 'end'] as const, 'start', `${path}.endpoint`);
      const key = `${wallId}:${endpoint}`;
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push({ wallId, endpoint, image: normalizedPoint(anchor.image, `${path}.image`) });
    }
    if (anchors.length < 2) throw new Plan2WorldDraftError('sourceRegistration must contain at least two distinct anchors');
    return { floorId, confidence: registrationConfidence, anchors: anchors.slice(0, 8) };
  } catch (error) {
    if (error instanceof Plan2WorldDraftError) return undefined;
    throw error;
  }
}

export function parsePlan2WorldDraft(input: unknown): Plan2WorldDraft {
  const v = record(input, 'draft');
  if (v.schemaVersion !== PLAN2WORLD_DRAFT_VERSION) {
    throw new Plan2WorldDraftError(`schemaVersion must be ${PLAN2WORLD_DRAFT_VERSION}`);
  }
  if (v.units !== 'cm') throw new Plan2WorldDraftError('units must be cm');

  const scaleRaw = record(v.scale, 'scale');
  const mode = enumValue(scaleRaw.mode, ['measured', 'provided', 'estimated'] as const, 'estimated', 'scale.mode');
  const scaleConfidence = confidence(scaleRaw.confidence, 'scale.confidence');
  if (scaleConfidence === undefined) throw new Plan2WorldDraftError('scale.confidence is required');

  if (!Array.isArray(v.floors) || v.floors.length === 0) {
    throw new Plan2WorldDraftError('floors must contain at least one floor');
  }

  const floors = v.floors.map((item, i) => parseFloor(item, i));
  uniqueIds(floors, 'floors');

  const assumptions = v.assumptions === undefined
    ? undefined
    : Array.isArray(v.assumptions) && v.assumptions.every(item => typeof item === 'string')
      ? v.assumptions as string[]
      : (() => { throw new Plan2WorldDraftError('assumptions must be an array of strings'); })();

  return {
    schemaVersion: PLAN2WORLD_DRAFT_VERSION,
    name: stringValue(v.name, 'name'),
    units: 'cm',
    scale: {
      mode,
      confidence: scaleConfidence,
      basis: scaleRaw.basis === undefined ? undefined : stringValue(scaleRaw.basis, 'scale.basis'),
    },
    assumptions,
    sourceRegistration: parseSourceRegistration(v.sourceRegistration, floors),
    floors,
  };
}

function wallThickness(wall: DraftWall): number {
  if (wall.thickness !== undefined) return wall.thickness;
  return wall.kind === 'exterior' ? DEFAULTS.exteriorWallThickness : DEFAULTS.interiorWallThickness;
}

function toFloor(draft: DraftFloor): Floor {
  const walls: Wall[] = draft.walls.map(wall => ({
    id: wall.id,
    start: { ...wall.start },
    end: { ...wall.end },
    curvePoint: wall.curvePoint ? { ...wall.curvePoint } : undefined,
    thickness: wallThickness(wall),
    height: wall.height ?? DEFAULTS.wallHeight,
    color: '#eeeeee',
  }));

  const doors: Door[] = (draft.doors ?? []).map(door => ({
    id: door.id,
    wallId: door.wallId,
    position: door.position,
    width: door.width,
    height: door.height ?? DEFAULTS.doorHeight,
    type: door.type ?? 'single',
    swingDirection: door.swingDirection ?? 'left',
    flipSide: door.flipSide ?? false,
  }));

  const windows: Window[] = (draft.windows ?? []).map(window => ({
    id: window.id,
    wallId: window.wallId,
    position: window.position,
    width: window.width,
    height: window.height ?? DEFAULTS.windowHeight,
    sillHeight: window.sillHeight ?? DEFAULTS.windowSillHeight,
    type: window.type ?? 'standard',
  }));

  const furniture: FurnitureItem[] = (draft.furniture ?? []).map(item => ({
    id: item.id,
    catalogId: item.catalogId,
    position: { ...item.position },
    rotation: item.rotation ?? 0,
    scale: { x: 1, y: 1, z: 1 },
  }));

  const floor: Floor = {
    id: draft.id,
    name: draft.name,
    level: draft.level,
    elevation: draft.elevation,
    walls,
    rooms: [],
    doors,
    windows,
    furniture,
    stairs: [],
    columns: [],
    guides: [],
    measurements: [],
    annotations: [],
    textAnnotations: [],
    groups: [],
  };

  floor.rooms = resolveRooms(floor);
  return floor;
}

export function draftToProject(input: unknown, now = new Date()): Project {
  const draft = parsePlan2WorldDraft(input);
  const floors = draft.floors.map(toFloor);
  const scaleDescription = `Scale: ${draft.scale.mode} (${Math.round(draft.scale.confidence * 100)}% confidence)${draft.scale.basis ? ` — ${draft.scale.basis}` : ''}.`;
  const assumptions = draft.assumptions?.length ? ` Assumptions: ${draft.assumptions.join(' | ')}` : '';

  return {
    id: `plan2world-${now.getTime().toString(36)}`,
    name: draft.name,
    reconstruction: {
      version: 1,
      scale: { ...draft.scale },
      assumptions: [...(draft.assumptions ?? [])],
      floors: draft.floors.map(floor => ({
        floorId: floor.id,
        walls: floor.walls.map(({ id, kind, confidence }) => ({ id, kind, confidence })),
        doors: (floor.doors ?? []).map(({ id, confidence }) => ({ id, confidence })),
        windows: (floor.windows ?? []).map(({ id, confidence }) => ({ id, confidence })),
      })),
    },
    description: `Imported from ${PLAN2WORLD_DRAFT_VERSION}. ${scaleDescription}${assumptions}`,
    floors,
    activeFloorId: floors[0].id,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}
