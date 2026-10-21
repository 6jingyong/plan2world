import { buildBareHouse, SOURCE_WALL_TRACE_VERSION } from './bareHouse';
import type { DraftPoint } from './draft';
import { reviewSourceTopology } from './sourceTopologyReview';
import { closeWallsWithFurniture } from './furnitureGuidedClosure';
import { freezeRasterEvidence, type SourceRasterInput } from './rasterWallContinuation';
import { rasterSamplingBounds } from './rasterBackground';
import { refineRasterWindows, continueRasterWalls, refineWindowsAtNormalizedJunctions } from './rasterArchitecture';
import { sourceRelativeGeometry } from './sourceRelativeGeometry';
import { parseFunctionalZones, closeWallsWithFunctionalZones, type SourceFunctionalZone } from './functionalZones';
import { assemblePlan2WorldDraftWithReview, parseSourceAnnotation, SOURCE_ANNOTATION_VERSION, type ReconstructionAssemblyContext, type SourceAnnotationV1 } from './reconstructionAssembly';

export const SOURCE_ARCHITECTURE_VERSION = 'source-architecture-v1' as const;
export const SOURCE_FURNISHING_VERSION = 'source-furnishing-v1' as const;
export const ARCHITECTURE_STAGE_VERSION = 'architecture-stage-v1' as const;
type Decision = 'accept' | 'uncertain' | 'reject';
interface EvidenceDecision {
  label: string;
  evidence: string;
  decision: Decision;
  decisionBasis: string;
  uncertainty?: string;
  sourceView?: string;
}
type ArchitectureWall = EvidenceDecision & { start: DraftPoint; end: DraftPoint; curvePoint?: DraftPoint };
type ArchitectureOpening = EvidenceDecision & NonNullable<SourceAnnotationV1['openings']>[number];
export interface SourceArchitectureV1 {
  schemaVersion: typeof SOURCE_ARCHITECTURE_VERSION;
  scaleEvidence: SourceAnnotationV1['scaleEvidence'];
  walls: ArchitectureWall[];
  openings: ArchitectureOpening[];
  doorGaps: { from: DraftPoint; to: DraftPoint; evidence: string }[];
  junctions: (EvidenceDecision & { position: DraftPoint })[];
  assumptions: string[];
  functionalZones?: SourceFunctionalZone[];
}

function record(value: unknown, path: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, any>;
}
function exactKeys(value: Record<string, any>, allowed: readonly string[], path: string) {
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new Error(`${path} contains unsupported fields: ${extras.join(', ')}`);
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}
function point(value: unknown, path: string): DraftPoint {
  const p = record(value, path); exactKeys(p, ['x', 'y'], path);
  if (![p.x, p.y].every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error(`${path} requires finite source pixels`);
  return { x: p.x, y: p.y };
}
const decisionKeys = ['label', 'evidence', 'decision', 'decisionBasis', 'uncertainty', 'sourceView'];
function decision(value: Record<string, any>, path: string): EvidenceDecision {
  if (!['accept', 'uncertain', 'reject'].includes(value.decision)) throw new Error(`${path}.decision is unsupported`);
  return { label: text(value.label, `${path}.label`), evidence: text(value.evidence, `${path}.evidence`),
    decision: value.decision, decisionBasis: text(value.decisionBasis, `${path}.decisionBasis`),
    ...(value.uncertainty === undefined ? {} : { uncertainty: text(value.uncertainty, `${path}.uncertainty`) }),
    ...(value.sourceView === undefined ? {} : { sourceView: text(value.sourceView, `${path}.sourceView`) }) };
}

/** Concise visual evidence and decisions, not a private reasoning transcript.
 * All architectural observations are captured together before normalization.
 */
export function parseSourceArchitecture(input: unknown): SourceArchitectureV1 {
  const root = record(input, 'architecture');
  exactKeys(root, ['schemaVersion', 'scaleEvidence', 'walls', 'openings', 'doorGaps', 'junctions', 'assumptions', 'functionalZones'], 'architecture');
  if (root.schemaVersion !== SOURCE_ARCHITECTURE_VERSION) throw new Error(`architecture requires ${SOURCE_ARCHITECTURE_VERSION}`);
  const walls = array(root.walls, 'architecture.walls').map((raw, index) => {
    const path = `architecture.walls[${index}]`, wall = record(raw, path);
    exactKeys(wall, [...decisionKeys, 'start', 'end', 'curvePoint'], path);
    return { ...decision(wall, path), start: point(wall.start, `${path}.start`), end: point(wall.end, `${path}.end`),
      ...(wall.curvePoint === undefined ? {} : { curvePoint: point(wall.curvePoint, `${path}.curvePoint`) }) };
  });
  const candidates = array(root.openings, 'architecture.openings').map((raw, index) => {
    const path = `architecture.openings[${index}]`, opening = record(raw, path);
    exactKeys(opening, [...decisionKeys, 'kind', 'endpoints', 'doorType', 'typeEvidence'], path);
    return { audit: decision(opening, path), observation: {
      kind: opening.kind, endpoints: opening.endpoints, evidence: opening.evidence,
      ...(opening.doorType === undefined ? {} : { doorType: opening.doorType }),
      ...(opening.typeEvidence === undefined ? {} : { typeEvidence: opening.typeEvidence }) } };
  });
  // Reuse the existing scale/opening contract for every candidate, including
  // uncertain and rejected candidates. Only accepted observations are applied.
  const annotation = parseSourceAnnotation({ schemaVersion: SOURCE_ANNOTATION_VERSION, scaleEvidence: root.scaleEvidence,
    openings: candidates.map(item => item.observation), furniture: [], assumptions: root.assumptions ?? [] });
  const doorGaps = array(root.doorGaps ?? [], 'architecture.doorGaps').map((raw, index) => {
    const path = `architecture.doorGaps[${index}]`, gap = record(raw, path);
    exactKeys(gap, ['from', 'to', 'evidence'], path);
    return { from: point(gap.from, `${path}.from`), to: point(gap.to, `${path}.to`), evidence: text(gap.evidence, `${path}.evidence`) };
  });
  const junctions = array(root.junctions ?? [], 'architecture.junctions').map((raw, index) => {
    const path = `architecture.junctions[${index}]`, junction = record(raw, path);
    exactKeys(junction, [...decisionKeys, 'position'], path);
    return { ...decision(junction, path), position: point(junction.position, `${path}.position`) };
  });
  return { schemaVersion: SOURCE_ARCHITECTURE_VERSION, scaleEvidence: annotation.scaleEvidence, walls,
    openings: candidates.map((item, index) => ({ ...annotation.openings![index], ...item.audit })),
    doorGaps, junctions, assumptions: annotation.assumptions ?? [],
    ...(root.functionalZones === undefined ? {} : { functionalZones: parseFunctionalZones(root.functionalZones) }) };
}

export function parseSourceFurnishing(input: unknown, scaleEvidence: SourceAnnotationV1['scaleEvidence']) {
  const furnishing = record(input, 'furnishing');
  exactKeys(furnishing, ['schemaVersion', 'furniture', 'assumptions'], 'furnishing');
  if (furnishing.schemaVersion !== SOURCE_FURNISHING_VERSION) throw new Error(`furnishing requires ${SOURCE_FURNISHING_VERSION}`);
  const parsed = parseSourceAnnotation({ schemaVersion: SOURCE_ANNOTATION_VERSION, scaleEvidence,
    furniture: furnishing.furniture ?? [], assumptions: furnishing.assumptions ?? [] });
  return { schemaVersion: SOURCE_FURNISHING_VERSION, furniture: parsed.furniture ?? [], assumptions: parsed.assumptions ?? [] };
}

export function prepareArchitectureStage(input: unknown, context: ReconstructionAssemblyContext = {}, furnishingInput?: unknown, rasterInput?: SourceRasterInput) {
  const architecture = parseSourceArchitecture(input);
  const furnishingEvidence = furnishingInput === undefined ? undefined : parseSourceFurnishing(furnishingInput, architecture.scaleEvidence);
  const sourceContext = { ...context };
  if (architecture.functionalZones) sourceContext.functionalZoneLabels = architecture.functionalZones.filter(zone => zone.decision === 'accept')
    .map(({ label, category, environment, position }) => ({ label, category, environment, position }));
  if (context.sourceWidthPx !== undefined || context.sourceHeightPx !== undefined) {
    const width = context.sourceWidthPx, height = context.sourceHeightPx;
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Architecture requires both positive source dimensions.');
    const points = [...architecture.walls.flatMap(wall => [wall.start, wall.end, ...(wall.curvePoint ? [wall.curvePoint] : [])]),
      ...architecture.openings.flatMap(opening => opening.endpoints), ...architecture.scaleEvidence.endpoints,
      ...architecture.doorGaps.flatMap(gap => [gap.from, gap.to]), ...architecture.junctions.map(junction => junction.position),
      ...(architecture.functionalZones ?? []).flatMap(zone => [zone.position, ...zone.boundary.flatMap(b => [b.point, ...(b.curvePoint ? [b.curvePoint] : [])])]),
      ...(furnishingEvidence?.furniture.map(item => item.position) ?? [])];
    if (points.some(point => point.x < 0 || point.y < 0 || point.x > width || point.y > height)) throw new Error('Architecture evidence lies outside the original source raster.');
  }
  const acceptedWalls = architecture.walls.filter(wall => wall.decision === 'accept');
  const wallTrace = { schemaVersion: SOURCE_WALL_TRACE_VERSION,
    walls: acceptedWalls.map(({ start, end, curvePoint }) => ({ start, end, ...(curvePoint ? { curvePoint } : {}) })),
    doorGaps: architecture.doorGaps.map(({ from, to }) => ({ from, to })) };
  const acceptedOpenings = architecture.openings.filter(opening => opening.decision === 'accept');
  const summaries = [...architecture.walls, ...architecture.openings].flatMap(item => item.decision !== 'accept'
    ? [`${item.label}: ${item.decision}. ${item.decisionBasis}${item.uncertainty ? ` ${item.uncertainty}` : ''}`]
    : item.uncertainty ? [`${item.label}: ${item.uncertainty}`] : []);
  let annotationBase: SourceAnnotationV1 = { schemaVersion: SOURCE_ANNOTATION_VERSION, scaleEvidence: architecture.scaleEvidence,
    openings: acceptedOpenings.map(({ kind, endpoints, evidence, doorType, typeEvidence }) => ({ kind, endpoints, evidence,
      ...(doorType ? { doorType } : {}), ...(typeEvidence ? { typeEvidence } : {}) })),
    furniture: [], assumptions: [...architecture.assumptions, ...summaries] };
  const samplingBounds = rasterSamplingBounds([
    ...wallTrace.walls.flatMap(wall => [wall.start, wall.end, ...(wall.curvePoint ? [wall.curvePoint] : [])]),
    ...(architecture.functionalZones ?? []).filter(zone => zone.decision === 'accept')
      .flatMap(zone => zone.boundary.flatMap(edge => [edge.point, ...(edge.curvePoint ? [edge.curvePoint] : [])])),
  ]);
  const rasterEvidence = rasterInput ? freezeRasterEvidence(rasterInput, samplingBounds) : undefined;
  if (rasterEvidence && (rasterEvidence.width !== context.sourceWidthPx || rasterEvidence.height !== context.sourceHeightPx)) throw new Error('Raster evidence must match original source dimensions.');
  // Centerline detection is an explicit read-only diagnostic, never an input
  // to generation. Keep this path independent of its implementation/results.
  const windowRefinement = rasterEvidence ? refineRasterWindows(wallTrace, annotationBase, sourceContext, rasterEvidence) : undefined;
  if (windowRefinement) annotationBase = windowRefinement.annotation;
  const guidingAnnotation = { ...annotationBase, furniture: furnishingEvidence?.furniture ?? [] };
  const rasterContinuation = rasterEvidence && furnishingEvidence ? continueRasterWalls(wallTrace, guidingAnnotation, sourceContext, rasterEvidence) : undefined;
  const programTrace = rasterContinuation?.normalizationInput ?? wallTrace;
  const functional = architecture.functionalZones === undefined ? undefined
    : closeWallsWithFunctionalZones(programTrace, guidingAnnotation, architecture.functionalZones, sourceContext);
  const closure = furnishingEvidence && !functional ? closeWallsWithFurniture(programTrace, guidingAnnotation, sourceContext) : undefined;
  const bareHouse = functional?.bareHouse ?? closure?.bareHouse ?? buildBareHouse(programTrace);
  if (functional) annotationBase = { ...functional.annotation, furniture: [] };
  const normalizedWindows = rasterEvidence ? refineWindowsAtNormalizedJunctions(bareHouse, annotationBase, sourceContext, rasterEvidence) : undefined;
  if (normalizedWindows) annotationBase = normalizedWindows.annotation;
  const sourceTopologyReview = reviewSourceTopology(bareHouse, sourceContext, architecture.junctions.filter(junction => junction.decision === 'accept'));
  const assembled = assemblePlan2WorldDraftWithReview(bareHouse, annotationBase, sourceContext);
  let wallIndex = 0, doorIndex = 0, windowIndex = 0;
  const wallAudit = architecture.walls.map((wall, index) => ({ candidate: index + 1, ...wall,
    normalizedWallIds: wall.decision === 'accept' ? bareHouse.sourceWallMap[`w${++wallIndex}`] : [] }));
  const openingAudit = architecture.openings.map((opening, index) => {
    const outputId = opening.decision === 'accept' ? opening.kind === 'door' ? `d${++doorIndex}` : `win${++windowIndex}` : undefined;
    const interval = assembled.openingReview.sourceIntervals.find(item => item.id === outputId);
    return { candidate: index + 1, ...opening, outputId,
      ...(interval?.outputIds ? { outputIds: interval.outputIds } : {}),
      programStatus: outputId ? interval ? 'assembled' : 'unresolved-host' : 'not-applied',
      programInterval: interval ?? null,
      programWarnings: outputId ? assembled.openingReview.warnings.filter(item => item.id === outputId).map(item => item.message) : [] };
  });
  return { schemaVersion: ARCHITECTURE_STAGE_VERSION, architecture, sourceContext, wallTrace, bareHouse,
    centerlinePolicy: 'disabled' as const,
    ...(sourceContext.sourceWidthPx && sourceContext.sourceHeightPx ? { relativeGeometry:
      sourceRelativeGeometry(bareHouse.walls, sourceContext.sourceWidthPx, sourceContext.sourceHeightPx) } : {}),
    annotationBase, architectureDraft: assembled.draft, wallAudit, openingAudit, sourceTopologyReview,
    ...(rasterEvidence ? { rasterEvidence, windowRefinementReview: windowRefinement!.review,
      normalizedWindowReview: normalizedWindows!.review,
      ...(rasterContinuation ? { rasterContinuationReview: rasterContinuation.review } : {}) } : {}),
    ...(functional ? { functionalZoneReview: functional.review } : {}),
    ...(closure ? { closureReview: closure.review } : {}),
    ...(furnishingEvidence ? { furnishingEvidence } : {}) };
}

export function assertArchitectureHostsResolved(stage: ReturnType<typeof prepareArchitectureStage>) {
  const unresolved = stage.openingAudit.filter(item => item.programStatus === 'unresolved-host');
  if (unresolved.length) throw new Error(`Architecture has unresolved accepted openings: ${unresolved.map(item => item.label).join(', ')}. Use an explicit diagnostic assembly only to investigate this failed stage.`);
  if (stage.functionalZoneReview && (!stage.functionalZoneReview.allOpeningHostsResolved || stage.functionalZoneReview.unresolvedDerivedOpenings.length)) throw new Error('Functional-zone passages have unresolved hosts. Review the frozen evidence.');
}

/** Furniture observations have no authority to change or reconsider architecture. */
export function assembleFrozenArchitecture(stageInput: unknown, furnishingInput: unknown, options: { allowUnresolvedOpenings?: boolean } = {}) {
  const saved = record(stageInput, 'stage');
  if (saved.schemaVersion !== ARCHITECTURE_STAGE_VERSION) throw new Error(`stage requires ${ARCHITECTURE_STAGE_VERSION}`);
  const stage = prepareArchitectureStage(saved.architecture, saved.sourceContext, saved.furnishingEvidence, saved.rasterEvidence);
  if (JSON.stringify(stage) !== JSON.stringify(saved)) throw new Error('Frozen architecture stage is inconsistent or was generated by different code; start a fresh run.');
  const unresolved = stage.openingAudit.filter(item => item.programStatus === 'unresolved-host');
  if (!options.allowUnresolvedOpenings) assertArchitectureHostsResolved(stage);
  const furnishing = parseSourceFurnishing(furnishingInput, stage.architecture.scaleEvidence);
  if (stage.furnishingEvidence && JSON.stringify(stage.furnishingEvidence) !== JSON.stringify(furnishing)) throw new Error('Furniture anchors were frozen with guided closure; changed evidence requires a new stage.');
  const annotation = parseSourceAnnotation({ ...stage.annotationBase, furniture: furnishing.furniture ?? [],
    assumptions: [...(stage.annotationBase.assumptions ?? []), ...array(furnishing.assumptions ?? [], 'furnishing.assumptions')] });
  const result = assemblePlan2WorldDraftWithReview(stage.bareHouse, annotation, stage.sourceContext);
  const structural = (draft: typeof result.draft) => draft.floors.map(({ walls, doors, windows }) => ({ walls, doors, windows }));
  if (JSON.stringify(structural(result.draft)) !== JSON.stringify(structural(stage.architectureDraft))) throw new Error('Furniture assembly changed frozen architecture.');
  return { draft: result.draft, architectureUnchanged: true, openingAudit: stage.openingAudit,
    validationStatus: unresolved.length ? 'diagnostic-unresolved-openings' : 'architecture-hosts-resolved' };
}
