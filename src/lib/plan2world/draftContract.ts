import type { Door, FloorBoundaryPart, Window, FunctionalZoneLabel } from '$lib/models/types';
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
  image: DraftPoint;
}

export interface DraftSourceRegistration {
  floorId: string;
  confidence: number;
  anchors: DraftSourceAnchor[];
}

export interface DraftWall {
  boundaryType?: 'solid' | 'railing' | 'air';
  id: string;
  start: DraftPoint;
  end: DraftPoint;
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

export interface DraftFloor {
  functionalZones?: FunctionalZoneLabel[];
  id: string;
  name: string;
  level: number;
  elevation?: number;
  walls: DraftWall[];
  doors?: DraftDoor[];
  windows?: DraftWindow[];
  furniture?: DraftFurniture[];
  floorAreas?: DraftFloorArea[];
}

export interface Plan2WorldDraft {
  schemaVersion: typeof PLAN2WORLD_DRAFT_VERSION;
  name: string;
  units: 'cm';
  furnitureVocabulary?: typeof PLAN2WORLD_FURNITURE_VOCABULARY;
  scale: DraftScale;
  assumptions?: string[];
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Plan2WorldDraftError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Plan2WorldDraftError(`${path} must be a non-empty string`);
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Plan2WorldDraftError(`${path} must be a finite number`);
  return value;
}

function positive(value: unknown, path: string): number {
  const valueNumber = finite(value, path);
  if (valueNumber <= 0) throw new Plan2WorldDraftError(`${path} must be greater than zero`);
  return valueNumber;
}

function optionalPositive(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : positive(value, path);
}

function confidence(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  const valueNumber = finite(value, path);
  if (valueNumber < 0 || valueNumber > 1) throw new Plan2WorldDraftError(`${path} must be between 0 and 1`);
  return valueNumber;
}

function point(value: unknown, path: string): DraftPoint {
  const item = record(value, path);
  return { x: finite(item.x, `${path}.x`), y: finite(item.y, `${path}.y`) };
}

function normalizedPoint(value: unknown, path: string): DraftPoint {
  const valuePoint = point(value, path);
  if (valuePoint.x < 0 || valuePoint.x > 1 || valuePoint.y < 0 || valuePoint.y > 1) {
    throw new Plan2WorldDraftError(`${path} coordinates must be between 0 and 1`);
  }
  return valuePoint;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T, path: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Plan2WorldDraftError(`${path} has an unsupported value`);
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
  const item = record(value, path);
  return {
    ...(item.boundaryType === undefined ? {} : { boundaryType: enumValue(item.boundaryType, ['solid', 'railing', 'air'] as const, 'solid', `${path}.boundaryType`) }),
    id: stringValue(item.id, `${path}.id`),
    start: point(item.start, `${path}.start`),
    end: point(item.end, `${path}.end`),
    curvePoint: item.curvePoint === undefined ? undefined : point(item.curvePoint, `${path}.curvePoint`),
    thickness: optionalPositive(item.thickness, `${path}.thickness`),
    height: optionalPositive(item.height, `${path}.height`),
    kind: item.kind === undefined ? undefined : enumValue(item.kind, ['interior', 'exterior', 'unknown'] as const, 'unknown', `${path}.kind`),
    confidence: confidence(item.confidence, `${path}.confidence`),
  };
}

function parseDoor(value: unknown, path: string): DraftDoor {
  const item = record(value, path);
  const position = finite(item.position, `${path}.position`);
  if (position < 0 || position > 1) throw new Plan2WorldDraftError(`${path}.position must be between 0 and 1`);
  return {
    id: stringValue(item.id, `${path}.id`), wallId: stringValue(item.wallId, `${path}.wallId`), position,
    width: positive(item.width, `${path}.width`), height: optionalPositive(item.height, `${path}.height`),
    type: item.type === undefined ? undefined : enumValue(item.type, ['single', 'double', 'sliding', 'french', 'pocket', 'bifold', 'opening', 'garage'] as const, 'single', `${path}.type`),
    swingDirection: item.swingDirection === undefined ? undefined : enumValue(item.swingDirection, ['left', 'right'] as const, 'left', `${path}.swingDirection`),
    flipSide: item.flipSide === undefined ? undefined : Boolean(item.flipSide),
    confidence: confidence(item.confidence, `${path}.confidence`),
  };
}

function parseWindow(value: unknown, path: string): DraftWindow {
  const item = record(value, path);
  const position = finite(item.position, `${path}.position`);
  if (position < 0 || position > 1) throw new Plan2WorldDraftError(`${path}.position must be between 0 and 1`);
  return {
    id: stringValue(item.id, `${path}.id`), wallId: stringValue(item.wallId, `${path}.wallId`), position,
    width: positive(item.width, `${path}.width`), height: optionalPositive(item.height, `${path}.height`),
    sillHeight: item.sillHeight === undefined ? undefined : finite(item.sillHeight, `${path}.sillHeight`),
    type: item.type === undefined ? undefined : enumValue(item.type, ['standard', 'fixed', 'casement', 'sliding', 'bay'] as const, 'standard', `${path}.type`),
    confidence: confidence(item.confidence, `${path}.confidence`),
  };
}

function parseFurniture(value: unknown, path: string): DraftFurniture {
  const item = record(value, path);
  return {
    id: stringValue(item.id, `${path}.id`), catalogId: stringValue(item.catalogId, `${path}.catalogId`),
    position: point(item.position, `${path}.position`), rotation: item.rotation === undefined ? undefined : finite(item.rotation, `${path}.rotation`),
    confidence: confidence(item.confidence, `${path}.confidence`),
    sourceCategory: item.sourceCategory === undefined ? undefined : stringValue(item.sourceCategory, `${path}.sourceCategory`),
    width: optionalPositive(item.width, `${path}.width`), depth: optionalPositive(item.depth, `${path}.depth`), height: optionalPositive(item.height, `${path}.height`),
  };
}

function parseFloor(value: unknown, index: number): DraftFloor {
  const path = `floors[${index}]`, item = record(value, path);
  if (item.functionalZones !== undefined && !Array.isArray(item.functionalZones)) throw new Plan2WorldDraftError(`${path}.functionalZones must be an array`);
  const functionalZones = item.functionalZones === undefined ? undefined : (item.functionalZones as unknown[]).map((raw, i) => {
    const z = record(raw, `${path}.functionalZones[${i}]`);
    return { id: stringValue(z.id, path), label: stringValue(z.label, path), category: stringValue(z.category, path),
      environment: enumValue(z.environment, ['indoor', 'balcony', 'outdoor'] as const, 'indoor', path), position: point(z.position, path) };
  });
  if (functionalZones) uniqueIds(functionalZones, `${path}.functionalZones`);
  if (!Number.isInteger(item.level)) throw new Plan2WorldDraftError(`${path}.level must be an integer`);
  if (!Array.isArray(item.walls) || item.walls.length === 0) throw new Plan2WorldDraftError(`${path}.walls must contain at least one wall`);

  const walls = item.walls.map((wall, wallIndex) => parseWall(wall, `${path}.walls[${wallIndex}]`));
  const doors = Array.isArray(item.doors) ? item.doors.map((door, doorIndex) => parseDoor(door, `${path}.doors[${doorIndex}]`)) : [];
  const windows = Array.isArray(item.windows) ? item.windows.map((window, windowIndex) => parseWindow(window, `${path}.windows[${windowIndex}]`)) : [];
  const furniture = Array.isArray(item.furniture) ? item.furniture.map((entry, furnitureIndex) => parseFurniture(entry, `${path}.furniture[${furnitureIndex}]`)) : [];
  if (item.components !== undefined) throw new Plan2WorldDraftError(`${path}.components is retired; 2D geometry must use walls, openings and floorAreas`);
  if (item.floorAreas !== undefined && !Array.isArray(item.floorAreas)) throw new Plan2WorldDraftError(`${path}.floorAreas must be an array`);
  const floorAreas: DraftFloorArea[] = ((item.floorAreas ?? []) as unknown[]).map((raw, areaIndex) => {
    const areaPath = `${path}.floorAreas[${areaIndex}]`, area = record(raw, areaPath);
    let boundary: FloorBoundaryPart[];
    try { boundary = readFloorBoundary(area.boundary, `${areaPath}.boundary`); }
    catch (error) { throw new Plan2WorldDraftError((error as Error).message); }
    const problem = floorBoundaryProblem(boundary, walls.map(wall => ({ ...wall, height: wall.height ?? 280, thickness: wall.thickness ?? 12, color: '#444444' })));
    if (problem) throw new Plan2WorldDraftError(`${areaPath}.boundary: ${problem}`);
    return { id: stringValue(area.id, `${areaPath}.id`), name: stringValue(area.name, `${areaPath}.name`), boundary, confidence: confidence(area.confidence, `${areaPath}.confidence`) };
  });

  uniqueIds(walls, `${path}.walls`); uniqueIds(doors, `${path}.doors`); uniqueIds(windows, `${path}.windows`); uniqueIds(furniture, `${path}.furniture`);
  uniqueIds([...walls, ...doors, ...windows, ...furniture, ...floorAreas], path);
  const wallIds = new Set(walls.map(wall => wall.id));
  for (const opening of [...doors, ...windows]) {
    if (!wallIds.has(opening.wallId)) throw new Plan2WorldDraftError(`${path}: opening ${opening.id} references unknown wall ${opening.wallId}`);
  }

  return {
    id: stringValue(item.id, `${path}.id`), name: stringValue(item.name, `${path}.name`), level: item.level as number,
    elevation: item.elevation === undefined ? undefined : finite(item.elevation, `${path}.elevation`),
    walls, doors, windows, furniture, floorAreas,
    ...(functionalZones === undefined ? {} : { functionalZones }),
  };
}

function parseSourceRegistration(value: unknown, floors: DraftFloor[]): DraftSourceRegistration | undefined {
  if (value === undefined) return undefined;
  const item = record(value, 'sourceRegistration');
  const floorId = stringValue(item.floorId, 'sourceRegistration.floorId');
  const floor = floors.find(entry => entry.id === floorId);
  if (!floor) throw new Plan2WorldDraftError('sourceRegistration.floorId must refer to a draft floor');
  const registrationConfidence = confidence(item.confidence, 'sourceRegistration.confidence');
  if (registrationConfidence === undefined) throw new Plan2WorldDraftError('sourceRegistration.confidence is required');
  if (!Array.isArray(item.anchors)) throw new Plan2WorldDraftError('sourceRegistration.anchors must be an array');
  const wallIds = new Set(floor.walls.map(wall => wall.id)), seen = new Set<string>(), anchors: DraftSourceAnchor[] = [];
  for (const [index, raw] of item.anchors.entries()) {
    const path = `sourceRegistration.anchors[${index}]`, anchor = record(raw, path);
    const wallId = stringValue(anchor.wallId, `${path}.wallId`);
    if (!wallIds.has(wallId)) throw new Plan2WorldDraftError(`${path}.wallId must refer to a wall on the registration floor`);
    const endpoint = enumValue(anchor.endpoint, ['start', 'end'] as const, 'start', `${path}.endpoint`);
    const key = `${wallId}:${endpoint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({ wallId, endpoint, image: normalizedPoint(anchor.image, `${path}.image`) });
  }
  if (anchors.length < 2) throw new Plan2WorldDraftError('sourceRegistration must contain at least two distinct anchors');
  return { floorId, confidence: registrationConfidence, anchors: anchors.slice(0, 8) };
}

export function parsePlan2WorldDraft(input: unknown, options: { requireFurnitureVocabulary?: boolean } = {}): Plan2WorldDraft {
  const draft = record(input, 'draft');
  if (draft.schemaVersion !== PLAN2WORLD_DRAFT_VERSION) throw new Plan2WorldDraftError(`schemaVersion must be ${PLAN2WORLD_DRAFT_VERSION}`);
  if (draft.units !== 'cm') throw new Plan2WorldDraftError('units must be cm');

  const scaleRaw = record(draft.scale, 'scale');
  const mode = enumValue(scaleRaw.mode, ['measured', 'provided', 'estimated'] as const, 'estimated', 'scale.mode');
  const scaleConfidence = confidence(scaleRaw.confidence, 'scale.confidence');
  if (scaleConfidence === undefined) throw new Plan2WorldDraftError('scale.confidence is required');
  if (!Array.isArray(draft.floors) || draft.floors.length === 0) throw new Plan2WorldDraftError('floors must contain at least one floor');

  const floors = draft.floors.map((floor, index) => parseFloor(floor, index));
  uniqueIds(floors, 'floors');
  const furnitureVocabulary = draft.furnitureVocabulary === undefined ? undefined
    : enumValue(draft.furnitureVocabulary, [PLAN2WORLD_FURNITURE_VOCABULARY] as const, PLAN2WORLD_FURNITURE_VOCABULARY, 'furnitureVocabulary');
  if (draft.componentVocabulary !== undefined) throw new Plan2WorldDraftError('componentVocabulary is retired');
  if (options.requireFurnitureVocabulary && !furnitureVocabulary) {
    throw new Plan2WorldDraftError(`Current reconstruction requires furnitureVocabulary: ${PLAN2WORLD_FURNITURE_VOCABULARY}`);
  }
  if (furnitureVocabulary) {
    for (const floor of floors) for (const item of floor.furniture ?? []) {
      if (item.catalogId !== 'imported_object' || !item.sourceCategory) {
        throw new Plan2WorldDraftError('Fixed-vocabulary furniture requires imported_object and sourceCategory');
      }
      if (!isPlan2WorldFurnitureType(item.sourceCategory)) {
        throw new Plan2WorldDraftError(`Furniture ${item.id}: sourceCategory ${item.sourceCategory} is not in ${furnitureVocabulary}`);
      }
    }
  }

  const assumptions = draft.assumptions === undefined ? undefined
    : Array.isArray(draft.assumptions) && draft.assumptions.every(item => typeof item === 'string')
      ? draft.assumptions as string[]
      : (() => { throw new Plan2WorldDraftError('assumptions must be an array of strings'); })();

  return {
    schemaVersion: PLAN2WORLD_DRAFT_VERSION,
    name: stringValue(draft.name, 'name'), units: 'cm', furnitureVocabulary,
    scale: { mode, confidence: scaleConfidence, basis: scaleRaw.basis === undefined ? undefined : stringValue(scaleRaw.basis, 'scale.basis') },
    assumptions, sourceRegistration: parseSourceRegistration(draft.sourceRegistration, floors), floors,
  };
}
