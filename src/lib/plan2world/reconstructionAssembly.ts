import type { BareHouseV1 } from './bareHouse';
import { parsePlan2WorldDraft, type DraftPoint, type DraftScaleMode, type Plan2WorldDraft } from './draft';
import { PLAN2WORLD_FURNITURE_VOCABULARY, isPlan2WorldFurnitureType } from './furnitureVocabulary';
import { deriveSourceOpenings } from './sourceOpenings';

export const SOURCE_ANNOTATION_VERSION = 'source-annotation-v1' as const;
export type SourceScaleEvidenceKind = 'measured_dimension' | 'scale_bar' | 'provided_length' | 'estimated_reference';

export interface SourceScaleEvidence {
  kind: SourceScaleEvidenceKind;
  realLengthCm: number;
  endpoints: [DraftPoint, DraftPoint];
  evidence: string;
}

export interface SourceAnnotationV1 {
  schemaVersion: typeof SOURCE_ANNOTATION_VERSION;
  scaleEvidence: SourceScaleEvidence;
  openings?: {
    kind: 'door' | 'window';
    endpoints: [DraftPoint, DraftPoint];
    evidence: string;
    doorType?: 'single' | 'double' | 'sliding' | 'opening';
    typeEvidence?: string;
  }[];
  furniture?: { sourceCategory: string; position: DraftPoint }[];
  assumptions?: string[];
}

export interface ReconstructionAssemblyContext {
  sourceWidthPx?: number;
  sourceHeightPx?: number;
}

const SCALE_POLICY: Record<SourceScaleEvidenceKind, { mode: DraftScaleMode; confidence: number }> = {
  measured_dimension: { mode: 'measured', confidence: 0.95 },
  scale_bar: { mode: 'measured', confidence: 0.95 },
  provided_length: { mode: 'provided', confidence: 1 },
  estimated_reference: { mode: 'estimated', confidence: 0.5 },
};

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
function point(value: unknown, path: string): DraftPoint {
  const item = record(value, path);
  const extras = Object.keys(item).filter(key => key !== 'x' && key !== 'y');
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
  return { x: finite(item.x, `${path}.x`), y: finite(item.y, `${path}.y`) };
}
function exactKeys(value: Record<string, any>, allowed: readonly string[], path: string): void {
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
}

export function parseSourceAnnotation(value: unknown): SourceAnnotationV1 {
  const root = record(value, 'annotation');
  exactKeys(root, ['schemaVersion', 'scaleEvidence', 'openings', 'furniture', 'assumptions'], 'annotation');
  if (root.schemaVersion !== SOURCE_ANNOTATION_VERSION) throw new Error(`annotation requires schemaVersion="${SOURCE_ANNOTATION_VERSION}"`);

  const scale = record(root.scaleEvidence, 'annotation.scaleEvidence');
  exactKeys(scale, ['kind', 'realLengthCm', 'endpoints', 'evidence'], 'annotation.scaleEvidence');
  if (!(scale.kind in SCALE_POLICY)) throw new Error('annotation.scaleEvidence.kind is unsupported');
  if (!Array.isArray(scale.endpoints) || scale.endpoints.length !== 2) throw new Error('annotation.scaleEvidence.endpoints requires two source points');
  const scaleEvidence: SourceScaleEvidence = {
    kind: scale.kind,
    realLengthCm: positive(scale.realLengthCm, 'annotation.scaleEvidence.realLengthCm'),
    endpoints: [point(scale.endpoints[0], 'annotation.scaleEvidence.endpoints[0]'), point(scale.endpoints[1], 'annotation.scaleEvidence.endpoints[1]')],
    evidence: text(scale.evidence, 'annotation.scaleEvidence.evidence'),
  };
  if (Math.hypot(scaleEvidence.endpoints[1].x - scaleEvidence.endpoints[0].x, scaleEvidence.endpoints[1].y - scaleEvidence.endpoints[0].y) <= 1e-6) {
    throw new Error('annotation.scaleEvidence endpoints must span a positive source distance');
  }

  const openingInput = root.openings ?? [];
  if (!Array.isArray(openingInput)) throw new Error('annotation.openings must be an array');
  const openings = openingInput.map((raw, index) => {
    const path = `annotation.openings[${index}]`, item = record(raw, path);
    exactKeys(item, ['kind', 'endpoints', 'evidence', 'doorType', 'typeEvidence'], path);
    if (item.kind !== 'door' && item.kind !== 'window') throw new Error(`${path}.kind must be door/window`);
    if (!Array.isArray(item.endpoints) || item.endpoints.length !== 2) throw new Error(`${path}.endpoints requires two source points`);
    if (item.doorType !== undefined && !['single', 'double', 'sliding', 'opening'].includes(item.doorType)) throw new Error(`${path}.doorType is unsupported`);
    return {
      kind: item.kind,
      endpoints: [point(item.endpoints[0], `${path}.endpoints[0]`), point(item.endpoints[1], `${path}.endpoints[1]`)] as [DraftPoint, DraftPoint],
      evidence: text(item.evidence, `${path}.evidence`),
      ...(item.doorType === undefined ? {} : { doorType: item.doorType }),
      ...(item.typeEvidence === undefined ? {} : { typeEvidence: text(item.typeEvidence, `${path}.typeEvidence`) }),
    };
  });

  const furnitureInput = root.furniture ?? [];
  if (!Array.isArray(furnitureInput)) throw new Error('annotation.furniture must be an array');
  const furniture = furnitureInput.map((raw, index) => {
    const path = `annotation.furniture[${index}]`, item = record(raw, path);
    exactKeys(item, ['sourceCategory', 'position'], path);
    const sourceCategory = text(item.sourceCategory, `${path}.sourceCategory`);
    if (!isPlan2WorldFurnitureType(sourceCategory)) throw new Error(`${sourceCategory} is not in ${PLAN2WORLD_FURNITURE_VOCABULARY}`);
    return { sourceCategory, position: point(item.position, `${path}.position`) };
  });

  const assumptionInput = root.assumptions ?? [];
  if (!Array.isArray(assumptionInput)) throw new Error('annotation.assumptions must be an array');
  const assumptions = assumptionInput.map((item, index) => text(item, `annotation.assumptions[${index}]`));
  return { schemaVersion: SOURCE_ANNOTATION_VERSION, scaleEvidence, openings, furniture, assumptions };
}

function deterministicSourceRegistration(bareHouse: BareHouseV1, context: ReconstructionAssemblyContext) {
  const hasWidth = context.sourceWidthPx !== undefined, hasHeight = context.sourceHeightPx !== undefined;
  if (!hasWidth && !hasHeight) return undefined;
  if (!hasWidth || !hasHeight) throw new Error('source registration requires both sourceWidthPx and sourceHeightPx');
  const width = positive(context.sourceWidthPx, 'sourceWidthPx'), height = positive(context.sourceHeightPx, 'sourceHeightPx');

  const candidates: { wallId: string; endpoint: 'start' | 'end'; point: DraftPoint }[] = [], seen = new Set<string>();
  for (const wall of bareHouse.walls) for (const endpoint of ['start', 'end'] as const) {
    const candidate = wall[endpoint];
    if (candidate.x < 0 || candidate.x > width || candidate.y < 0 || candidate.y > height) continue;
    const key = `${candidate.x.toFixed(6)},${candidate.y.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key); candidates.push({ wallId: wall.id, endpoint, point: candidate });
  }
  if (candidates.length < 2) return undefined;
  candidates.sort((a, b) => (a.point.x + a.point.y) - (b.point.x + b.point.y) || a.point.x - b.point.x || a.point.y - b.point.y || a.wallId.localeCompare(b.wallId));
  const selected = [candidates[0]];
  while (selected.length < Math.min(6, candidates.length)) {
    let best: typeof candidates[number] | undefined, bestDistance = -1;
    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue;
      const distance = Math.min(...selected.map(item => Math.hypot(candidate.point.x - item.point.x, candidate.point.y - item.point.y)));
      if (distance > bestDistance + 1e-9) { best = candidate; bestDistance = distance; }
    }
    if (!best || bestDistance <= 1e-9) break;
    selected.push(best);
  }
  if (selected.length < 2) return undefined;
  return {
    floorId: 'floor-0', confidence: 1,
    anchors: selected.map(item => ({ wallId: item.wallId, endpoint: item.endpoint, image: { x: item.point.x / width, y: item.point.y / height } })),
  };
}

export function assemblePlan2WorldDraft(bareHouse: BareHouseV1, annotationInput: unknown, context: ReconstructionAssemblyContext = {}): Plan2WorldDraft {
  const annotation = parseSourceAnnotation(annotationInput);
  const scalePolicy = SCALE_POLICY[annotation.scaleEvidence.kind];
  const scalePixels = Math.hypot(
    annotation.scaleEvidence.endpoints[1].x - annotation.scaleEvidence.endpoints[0].x,
    annotation.scaleEvidence.endpoints[1].y - annotation.scaleEvidence.endpoints[0].y,
  );
  const cmPerPixel = annotation.scaleEvidence.realLengthCm / scalePixels;
  const points = bareHouse.walls.flatMap(wall => [wall.start, wall.end, ...(wall.curvePoint ? [wall.curvePoint] : [])]);
  if (!points.length) throw new Error('bareHouse has no walls');
  const origin = { x: Math.min(...points.map(item => item.x)), y: Math.min(...points.map(item => item.y)) };
  const convert = (item: DraftPoint): DraftPoint => ({ x: (item.x - origin.x) * cmPerPixel, y: (item.y - origin.y) * cmPerPixel });
  const walls = bareHouse.walls.map(wall => ({ id: wall.id, start: convert(wall.start), end: convert(wall.end), ...(wall.curvePoint ? { curvePoint: convert(wall.curvePoint) } : {}) }));

  let doorIndex = 0, windowIndex = 0;
  const openingEvidence = (annotation.openings ?? []).map(item => ({ id: item.kind === 'door' ? `d${++doorIndex}` : `win${++windowIndex}`, ...item }));
  const openingReview = deriveSourceOpenings({ cmPerPixel, bareHouse, openings: openingEvidence });
  const assumptions = [...(annotation.assumptions ?? []), ...openingReview.warnings.map(item => `Opening ${item.id}: ${item.message}`)];
  const sourceRegistration = deterministicSourceRegistration(bareHouse, context);

  return parsePlan2WorldDraft({
    schemaVersion: 'plan2world-draft-v1', furnitureVocabulary: PLAN2WORLD_FURNITURE_VOCABULARY,
    name: 'AI floor-plan reconstruction', units: 'cm',
    scale: { mode: scalePolicy.mode, confidence: scalePolicy.confidence, basis: annotation.scaleEvidence.evidence },
    ...(assumptions.length ? { assumptions } : {}), ...(sourceRegistration ? { sourceRegistration } : {}),
    floors: [{
      id: 'floor-0', name: 'Ground Floor', level: 0, walls,
      doors: openingReview.doors, windows: openingReview.windows,
      furniture: (annotation.furniture ?? []).map((item, index) => ({
        id: `f${index + 1}`, catalogId: 'imported_object', sourceCategory: item.sourceCategory, position: convert(item.position),
      })),
    }],
  }, { requireFurnitureVocabulary: true });
}
