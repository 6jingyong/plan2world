import type { BareHouseV1 } from './bareHouse';
import { parsePlan2WorldDraft, type DraftPoint, type DraftScaleMode, type Plan2WorldDraft } from './draft';
import { PLAN2WORLD_FURNITURE_VOCABULARY, isPlan2WorldFurnitureType } from './furnitureVocabulary';
import { deriveSourceOpenings } from './sourceOpenings';

export const SOURCE_ANNOTATION_VERSION = 'source-annotation-v1' as const;

export interface SourceScaleEvidence {
  mode: DraftScaleMode;
  realLengthCm: number;
  endpoints: [DraftPoint, DraftPoint];
  confidence: number;
  basis: string;
}

export interface SourceAnnotationV1 {
  schemaVersion: typeof SOURCE_ANNOTATION_VERSION;
  scaleEvidence: SourceScaleEvidence;
  openings?: {
    id: string;
    kind: 'door' | 'window';
    wallId: string;
    endpoints: [DraftPoint, DraftPoint];
    evidence: string;
    doorType?: 'single' | 'double' | 'sliding' | 'opening';
    typeEvidence?: string;
    confidence?: number;
  }[];
  furniture?: {
    id: string;
    sourceCategory: string;
    position: DraftPoint;
    confidence?: number;
  }[];
  assumptions?: string[];
}

function record(value: unknown, path: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, any>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value;
}
function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be finite`);
  return value;
}
function positive(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result <= 0) throw new Error(`${path} must be positive`);
  return result;
}
function confidence(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result < 0 || result > 1) throw new Error(`${path} must be in 0..1`);
  return result;
}
function point(value: unknown, path: string): DraftPoint {
  const item = record(value, path);
  return { x: finite(item.x, `${path}.x`), y: finite(item.y, `${path}.y`) };
}
function exactKeys(value: Record<string, any>, allowed: readonly string[], path: string) {
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
}

export function parseSourceAnnotation(value: unknown): SourceAnnotationV1 {
  const root = record(value, 'annotation');
  exactKeys(root, ['schemaVersion', 'scaleEvidence', 'openings', 'furniture', 'assumptions'], 'annotation');
  if (root.schemaVersion !== SOURCE_ANNOTATION_VERSION) throw new Error(`annotation requires schemaVersion="${SOURCE_ANNOTATION_VERSION}"`);

  const scale = record(root.scaleEvidence, 'annotation.scaleEvidence');
  exactKeys(scale, ['mode', 'realLengthCm', 'endpoints', 'confidence', 'basis'], 'annotation.scaleEvidence');
  if (!['measured', 'provided', 'estimated'].includes(scale.mode)) throw new Error('annotation.scaleEvidence.mode is unsupported');
  if (!Array.isArray(scale.endpoints) || scale.endpoints.length !== 2) throw new Error('annotation.scaleEvidence.endpoints requires two source points');
  const scaleEvidence: SourceScaleEvidence = {
    mode: scale.mode,
    realLengthCm: positive(scale.realLengthCm, 'annotation.scaleEvidence.realLengthCm'),
    endpoints: [point(scale.endpoints[0], 'annotation.scaleEvidence.endpoints[0]'), point(scale.endpoints[1], 'annotation.scaleEvidence.endpoints[1]')],
    confidence: confidence(scale.confidence, 'annotation.scaleEvidence.confidence'),
    basis: text(scale.basis, 'annotation.scaleEvidence.basis'),
  };
  if (Math.hypot(scaleEvidence.endpoints[1].x - scaleEvidence.endpoints[0].x, scaleEvidence.endpoints[1].y - scaleEvidence.endpoints[0].y) <= 1e-6) {
    throw new Error('annotation.scaleEvidence endpoints must span a positive source distance');
  }

  const openings = root.openings === undefined ? [] : root.openings;
  if (!Array.isArray(openings)) throw new Error('annotation.openings must be an array');
  const parsedOpenings = openings.map((raw, index) => {
    const item = record(raw, `annotation.openings[${index}]`);
    exactKeys(item, ['id', 'kind', 'wallId', 'endpoints', 'evidence', 'doorType', 'typeEvidence', 'confidence'], `annotation.openings[${index}]`);
    if (item.kind !== 'door' && item.kind !== 'window') throw new Error(`annotation.openings[${index}].kind must be door/window`);
    if (!Array.isArray(item.endpoints) || item.endpoints.length !== 2) throw new Error(`annotation.openings[${index}].endpoints requires two source points`);
    const doorType = item.doorType;
    if (doorType !== undefined && !['single', 'double', 'sliding', 'opening'].includes(doorType)) throw new Error(`annotation.openings[${index}].doorType is unsupported`);
    return {
      id: text(item.id, `annotation.openings[${index}].id`),
      kind: item.kind,
      wallId: text(item.wallId, `annotation.openings[${index}].wallId`),
      endpoints: [point(item.endpoints[0], `annotation.openings[${index}].endpoints[0]`), point(item.endpoints[1], `annotation.openings[${index}].endpoints[1]`)] as [DraftPoint, DraftPoint],
      evidence: text(item.evidence, `annotation.openings[${index}].evidence`),
      ...(doorType === undefined ? {} : { doorType }),
      ...(item.typeEvidence === undefined ? {} : { typeEvidence: text(item.typeEvidence, `annotation.openings[${index}].typeEvidence`) }),
      ...(item.confidence === undefined ? {} : { confidence: confidence(item.confidence, `annotation.openings[${index}].confidence`) }),
    };
  });

  const furniture = root.furniture === undefined ? [] : root.furniture;
  if (!Array.isArray(furniture)) throw new Error('annotation.furniture must be an array');
  const parsedFurniture = furniture.map((raw, index) => {
    const item = record(raw, `annotation.furniture[${index}]`);
    exactKeys(item, ['id', 'sourceCategory', 'position', 'confidence'], `annotation.furniture[${index}]`);
    const sourceCategory = text(item.sourceCategory, `annotation.furniture[${index}].sourceCategory`);
    if (!isPlan2WorldFurnitureType(sourceCategory)) throw new Error(`${sourceCategory} is not in ${PLAN2WORLD_FURNITURE_VOCABULARY}`);
    return {
      id: text(item.id, `annotation.furniture[${index}].id`),
      sourceCategory,
      position: point(item.position, `annotation.furniture[${index}].position`),
      ...(item.confidence === undefined ? {} : { confidence: confidence(item.confidence, `annotation.furniture[${index}].confidence`) }),
    };
  });

  const assumptions = root.assumptions === undefined ? [] : root.assumptions;
  if (!Array.isArray(assumptions)) throw new Error('annotation.assumptions must be an array');
  const parsedAssumptions = assumptions.map((item, index) => text(item, `annotation.assumptions[${index}]`));

  return { schemaVersion: SOURCE_ANNOTATION_VERSION, scaleEvidence, openings: parsedOpenings, furniture: parsedFurniture, assumptions: parsedAssumptions };
}

export function assemblePlan2WorldDraft(bareHouse: BareHouseV1, annotationInput: unknown): Plan2WorldDraft {
  const annotation = parseSourceAnnotation(annotationInput);
  const scalePixels = Math.hypot(
    annotation.scaleEvidence.endpoints[1].x - annotation.scaleEvidence.endpoints[0].x,
    annotation.scaleEvidence.endpoints[1].y - annotation.scaleEvidence.endpoints[0].y,
  );
  const cmPerPixel = annotation.scaleEvidence.realLengthCm / scalePixels;

  const points = bareHouse.walls.flatMap(wall => [wall.start, wall.end, ...(wall.curvePoint ? [wall.curvePoint] : [])]);
  if (!points.length) throw new Error('bareHouse has no walls');
  const origin = {
    x: Math.min(...points.map(item => item.x)),
    y: Math.min(...points.map(item => item.y)),
  };
  const convert = (item: DraftPoint): DraftPoint => ({
    x: (item.x - origin.x) * cmPerPixel,
    y: (item.y - origin.y) * cmPerPixel,
  });

  const walls = bareHouse.walls.map(wall => ({
    id: wall.id,
    start: convert(wall.start),
    end: convert(wall.end),
    ...(wall.curvePoint ? { curvePoint: convert(wall.curvePoint) } : {}),
  }));

  const openingReview = deriveSourceOpenings({
    cmPerPixel,
    bareHouse,
    openings: annotation.openings ?? [],
  });

  const assumptions = [
    ...(annotation.assumptions ?? []),
    ...openingReview.warnings.map(item => `Opening ${item.id}: ${item.message}`),
  ];

  const draft = {
    schemaVersion: 'plan2world-draft-v1',
    presentation: 'semantic-white-model',
    furnitureVocabulary: PLAN2WORLD_FURNITURE_VOCABULARY,
    name: 'AI floor-plan reconstruction',
    units: 'cm',
    scale: {
      mode: annotation.scaleEvidence.mode,
      confidence: annotation.scaleEvidence.confidence,
      basis: annotation.scaleEvidence.basis,
    },
    ...(assumptions.length ? { assumptions } : {}),
    floors: [{
      id: 'floor-0',
      name: 'Ground Floor',
      level: 0,
      walls,
      doors: openingReview.doors,
      windows: openingReview.windows,
      furniture: (annotation.furniture ?? []).map(item => ({
        id: item.id,
        catalogId: 'imported_object',
        sourceCategory: item.sourceCategory,
        position: convert(item.position),
        ...(item.confidence === undefined ? {} : { confidence: item.confidence }),
      })),
    }],
  };

  return parsePlan2WorldDraft(draft, { requireFurnitureVocabulary: true });
}
