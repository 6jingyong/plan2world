import type { Door, FloorBoundaryPart, Window } from '$lib/models/types';
import { readFloorBoundary, floorBoundaryProblem } from '$lib/utils/floorBoundary';
import { PLAN2WORLD_FURNITURE_VOCABULARY, isPlan2WorldFurnitureType } from './furnitureVocabulary';

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
  /** Source semantics for an unstyled imported_object block. */
  sourceCategory?: string;
  width?: number;
  depth?: number;
  height?: number;
}

export interface DraftFloorArea {
  id: string;
  name: string;
  boundary: FloorBoundaryPart[];
  confidence?: number;
}

/** A closed wall-derived room whose slab is intentionally absent. */
export interface DraftFloorOpening {
  id: string;
  name: string;
  wallIds: string[];
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
  /** Ground outline for balconies/terraces; creates no physical partitions. */
  floorAreas?: DraftFloorArea[];
  /** Closed wall-backed slab voids such as source-supported shafts. */
  floorOpenings?: DraftFloorOpening[];
}

export interface Plan2WorldDraft {
  schemaVersion: typeof PLAN2WORLD_DRAFT_VERSION;
  name: string;
  units: 'cm';
  /** Opt-in reconstruction presentation; legacy drafts keep their defaults. */
  presentation?: 'semantic-white-model';
  /** Fixed extraction vocabulary; omitted only for historical drafts. */
  furnitureVocabulary?: typeof PLAN2WORLD_FURNITURE_VOCABULARY;
  scale: DraftScale;
  assumptions?: string[];
  /** Optional image-to-plan registration metadata. It is advisory and never required to import a draft. */
  sourceRegistration?: DraftSourceRegistration;
  floors: DraftFloor[];
}

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
    sourceCategory: v.sourceCategory === undefined ? undefined : stringValue(v.sourceCategory, `${path}.sourceCategory`),
    width: optionalPositive(v.width, `${path}.width`),
    depth: optionalPositive(v.depth, `${path}.depth`),
    height: optionalPositive(v.height, `${path}.height`),
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
  if (v.floorAreas !== undefined && !Array.isArray(v.floorAreas)) throw new Plan2WorldDraftError(`${path}.floorAreas must be an array`);
  const floorAreas: DraftFloorArea[] = ((v.floorAreas ?? []) as unknown[]).map((item, i) => {
    const areaPath = `${path}.floorAreas[${i}]`, area = record(item, areaPath);
    let boundary: FloorBoundaryPart[];
    try { boundary = readFloorBoundary(area.boundary, `${areaPath}.boundary`); }
    catch (error) { throw new Plan2WorldDraftError((error as Error).message); }
    const problem = floorBoundaryProblem(boundary, walls.map(wall => ({ ...wall, height: wall.height ?? 280, thickness: wall.thickness ?? 12, color: '#444444' })));
    if (problem) throw new Plan2WorldDraftError(`${areaPath}.boundary: ${problem}`);
    return { id: stringValue(area.id, `${areaPath}.id`), name: stringValue(area.name, `${areaPath}.name`),
      boundary, confidence: confidence(area.confidence, `${areaPath}.confidence`) };
  });

  if (v.floorOpenings !== undefined && !Array.isArray(v.floorOpenings)) throw new Plan2WorldDraftError(`${path}.floorOpenings must be an array`);
  const floorOpenings: DraftFloorOpening[] = ((v.floorOpenings ?? []) as unknown[]).map((item, i) => {
    const openingPath = `${path}.floorOpenings[${i}]`, opening = record(item, openingPath);
    if (!Array.isArray(opening.wallIds) || opening.wallIds.length < 3) {
      throw new Plan2WorldDraftError(`${openingPath}.wallIds must contain at least three wall ids`);
    }
    const wallIds = opening.wallIds.map((wallId, wi) => stringValue(wallId, `${openingPath}.wallIds[${wi}]`));
    if (new Set(wallIds).size !== wallIds.length) throw new Plan2WorldDraftError(`${openingPath}.wallIds must be unique`);
    return { id: stringValue(opening.id, `${openingPath}.id`), name: stringValue(opening.name, `${openingPath}.name`),
      wallIds, confidence: confidence(opening.confidence, `${openingPath}.confidence`) };
  });

  uniqueIds(walls, `${path}.walls`);
  uniqueIds(doors, `${path}.doors`);
  uniqueIds(windows, `${path}.windows`);
  uniqueIds(furniture, `${path}.furniture`);
  uniqueIds(floorOpenings, `${path}.floorOpenings`);
  uniqueIds([...walls, ...doors, ...windows, ...furniture, ...floorAreas, ...floorOpenings], path);

  const wallIds = new Set(walls.map(w => w.id));
  for (const opening of [...doors, ...windows]) {
    if (!wallIds.has(opening.wallId)) {
      throw new Plan2WorldDraftError(`${path}: opening ${opening.id} references unknown wall ${opening.wallId}`);
    }
  }
  for (const floorOpening of floorOpenings) for (const wallId of floorOpening.wallIds) {
    if (!wallIds.has(wallId)) {
      throw new Plan2WorldDraftError(`${path}: floor opening ${floorOpening.id} references unknown wall ${wallId}`);
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
    floorAreas,
    floorOpenings,
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

export function parsePlan2WorldDraft(input: unknown, options: { requireFurnitureVocabulary?: boolean } = {}): Plan2WorldDraft {
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
  const presentation = v.presentation === undefined ? undefined
    : enumValue(v.presentation, ['semantic-white-model'] as const, 'semantic-white-model', 'presentation');
  const furnitureVocabulary = v.furnitureVocabulary === undefined ? undefined
    : enumValue(v.furnitureVocabulary, [PLAN2WORLD_FURNITURE_VOCABULARY] as const, PLAN2WORLD_FURNITURE_VOCABULARY, 'furnitureVocabulary');
  if (options.requireFurnitureVocabulary && !furnitureVocabulary) {
    throw new Plan2WorldDraftError(`Current reconstruction requires furnitureVocabulary: ${PLAN2WORLD_FURNITURE_VOCABULARY}`);
  }
  if (furnitureVocabulary && !presentation) {
    throw new Plan2WorldDraftError('Fixed furniture vocabulary requires semantic-white-model presentation');
  }
  if (presentation) {
    for (const floor of floors) for (const item of floor.furniture ?? []) {
      if (item.catalogId !== 'imported_object' || !item.sourceCategory) {
        throw new Plan2WorldDraftError('Semantic furniture requires imported_object and sourceCategory');
      }
      if (furnitureVocabulary && !isPlan2WorldFurnitureType(item.sourceCategory)) {
        throw new Plan2WorldDraftError(`Furniture ${item.id}: sourceCategory ${item.sourceCategory} is not in ${furnitureVocabulary}`);
      }
    }
  }

  const assumptions = v.assumptions === undefined
    ? undefined
    : Array.isArray(v.assumptions) && v.assumptions.every(item => typeof item === 'string')
      ? v.assumptions as string[]
      : (() => { throw new Plan2WorldDraftError('assumptions must be an array of strings'); })();

  return {
    schemaVersion: PLAN2WORLD_DRAFT_VERSION,
    name: stringValue(v.name, 'name'),
    units: 'cm',
    presentation,
    furnitureVocabulary,
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
