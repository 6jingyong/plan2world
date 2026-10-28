import type { Point, Project } from '../models/types';
import { createDefaultProject } from '../models/projectDefaults';
import { readProject } from '../utils/projectValidation';
import { parseSourceArchitecture, parseSourceFurnishing, assembleFrozenArchitecture, type SourceArchitectureV1, type prepareArchitectureStage } from './architecture';
import { SourceRecoverySession, SourceRecoveryRequired } from './sourceRecovery';
import { draftToProjectWithSourceBackground, type SourceFloorPlanImage } from './sourceBackground';
import { summarizeArchitectureObservation } from './review';
import { buildArchitectureInstructions, buildReconstructionInstructions, type ReconstructionOptions } from './reconstructionInstructions';
import type { SourceRasterPixels } from './rasterWallContinuation';
import type { Plan2WorldDraft } from './draft';

const isPoint = (p: any): p is Point => p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y);
const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e);

/** Source errors become authoring annotations, not a new model retry. Provider,
 * file and image-identity errors remain operational failures. The returned
 * canonical Project is editable even if a strict walkthrough cannot compile yet. */
export async function reconstructFloorPlanForCorrection(
  observe: (prompt: string) => Promise<unknown>,
  source: { image: SourceFloorPlanImage; sha256: string; raster?: SourceRasterPixels },
  options: ReconstructionOptions = {},
) {
  const original = await observe(buildArchitectureInstructions(options));
  const session = await SourceRecoverySession.create(original, { sourceWidthPx: source.image.width, sourceHeightPx: source.image.height, sourceImageSha256: source.sha256 },
    { onStage: value => { stage = value; } });
  let architecture: SourceArchitectureV1 | undefined;
  let stage: ReturnType<typeof prepareArchitectureStage> | undefined;
  const failures: string[] = [];
  const localNotes: { message: string; position: Point; record: unknown }[] = [];
  const recordFailure = (e: unknown) => {
    if (e instanceof SourceRecoveryRequired && e.request) {
      if (e.request.phase === 'opening-hosts') return; // Each missing aperture gets its own source marker below.
      const [x,y,a,b] = e.request.focusBox;
      localNotes.push({ message: e.request.issue.code === 'ambiguous-wall-overlap' ? 'Wall traces overlap. Select the highlighted wall segments and keep the intended boundary.' : 'Source room boundary needs correction. Review the highlighted outline.',
        position: { x: (x+a)/2, y: (y+b)/2 }, record: e.request.localObservations });
    } else failures.push(errorMessage(e));
  };
  try { architecture = await session.preflight(); } catch (e) { recordFailure(e); }
  // Architecture stays frozen; no extra request asks the model to repair it.
  const furnishing = await observe(`${buildReconstructionInstructions()}\n\nFROZEN_ARCHITECTURE_JSON:\n${JSON.stringify(architecture ?? original)}`);
  if (architecture) try { stage = await session.prepare(furnishing, source.raster); } catch (e) { recordFailure(e); }
  let draft: Plan2WorldDraft | undefined, project: Project | undefined;
  if (stage) try {
    draft = assembleFrozenArchitecture(stage, furnishing, { allowUnresolvedOpenings: true }).draft;
    project = draftToProjectWithSourceBackground(draft, source.image);
    if (project.reconstruction) project.reconstruction.observationReview = summarizeArchitectureObservation(stage);
  } catch (e) { failures.push(errorMessage(e)); }
  const raw = session.audit.programProjection as any;
  if (!project) {
    project = createDefaultProject('Floor plan · correction');
    const floor = project.floors[0];
    let parsed: SourceArchitectureV1 | undefined;
    // Invalid zone outlines remain in the original record and in review notes.
    // This separate authoring projection does not claim that a zone was repaired.
    try {
      const base = { schemaVersion: raw?.schemaVersion, scaleEvidence: raw?.scaleEvidence, walls: [], openings: [], doorGaps: [], junctions: [], assumptions: [] };
      parsed = parseSourceArchitecture(base);
      for (const [i, wall] of (Array.isArray(raw?.walls) ? raw.walls : []).entries()) {
        try { parsed.walls.push(parseSourceArchitecture({ ...base, walls: [wall] }).walls[0]); }
        catch (e) { failures.push(`Source wall ${i + 1}: ${errorMessage(e)}`); }
      }
    } catch (e) { failures.push(errorMessage(e)); }
    const scale = parsed?.scaleEvidence;
    const factor = scale ? scale.realLengthCm / Math.hypot(scale.endpoints[1].x - scale.endpoints[0].x, scale.endpoints[1].y - scale.endpoints[0].y) : 1;
    const convert = (p: Point) => ({ x: p.x * factor, y: p.y * factor });
    floor.backgroundImage = { dataUrl: source.image.dataUrl, position: convert({ x: source.image.width / 2, y: source.image.height / 2 }), scale: factor, rotation: 0, opacity: .5, locked: true,
      reconstructionSource: { width: source.image.width, height: source.image.height, registration: 'bounds', name: source.image.name } };
    const inside = (p: Point) => isPoint(p) && p.x >= 0 && p.y >= 0 && p.x <= source.image.width && p.y <= source.image.height;
    for (const [i, w] of (parsed?.walls ?? []).entries()) {
      if (w.decision !== 'accept') continue;
      if (!inside(w.start) || !inside(w.end) || w.curvePoint && !inside(w.curvePoint) || w.start.x === w.end.x && w.start.y === w.end.y) {
        failures.push(`Source wall ${w.label} has invalid or out-of-image coordinates.`); continue;
      }
      floor.walls.push({ id: `observed-wall-${i + 1}`, start: convert(w.start), end: convert(w.end), ...(w.curvePoint ? { curvePoint: convert(w.curvePoint) } : {}), thickness: 15, height: 280, color: '#444444' });
    }
    if (scale) try {
      const f = parseSourceFurnishing(furnishing, scale);
      floor.furniture = f.furniture.filter(item => {
        if (inside(item.position)) return true;
        failures.push(`Furniture ${item.sourceCategory} is outside the source image and needs manual placement.`); return false;
      }).map((item, i) => ({ id: `observed-furniture-${i + 1}`, catalogId: 'imported_object', sourceCategory: item.sourceCategory,
        position: convert(item.position), rotation: 0, scale: { x: 1, y: 1, z: 1 }, renderStyle: 'block' as const }));
    } catch (e) { failures.push(errorMessage(e)); }
    if (!scale) failures.push('Scale could not be read. This correction canvas uses 1 cm per source pixel; establish the real dimensions before walkthrough.');
    project.reconstruction = { version: 1, scale: { mode: scale?.kind === 'provided_length' ? 'provided' : 'estimated', confidence: scale ? .5 : 0 },
      assumptions: ['Editable correction projection. Source errors have not been certified or silently repaired.', ...failures,
        ...(Array.isArray(raw?.assumptions) ? raw.assumptions.filter((v:unknown)=>typeof v==='string') : []),
        ...(Array.isArray((furnishing as any)?.assumptions) ? (furnishing as any).assumptions.filter((v:unknown)=>typeof v==='string') : [])],
      floors: [{ floorId: floor.id, walls: floor.walls.map(w => ({ id: w.id })), doors: [], windows: [] }] };
    if (source.image.preparation) project.reconstruction.inputPreparation = structuredClone(source.image.preparation);
  }
  const floor = project.floors[0];
  const issues: NonNullable<Project['architectureReview']>['issues'] = [];
  const sourcePoint = (p?: Point) => {
    const bg = floor.backgroundImage;
    if (!p || !bg) return undefined;
    const a = bg.rotation * Math.PI / 180, x = (p.x - source.image.width / 2) * bg.scale, y = (p.y - source.image.height / 2) * bg.scale;
    return { x: bg.position.x + Math.cos(a) * x - Math.sin(a) * y, y: bg.position.y + Math.sin(a) * x + Math.cos(a) * y };
  };
  const issue = (message: string, record?: unknown, position?: Point) => issues.push({ id: `source-issue-${issues.length + 1}`, floorId: floor.id, message,
    ...(position ? { position: sourcePoint(position) } : {}), ...(record === undefined ? {} : { sourceRecord: JSON.stringify(record) }), resolved: false });
  for (const text of [...new Set(failures)]) issue(text);
  for (const note of localNotes) issue(note.message, note.record, note.position);
  if(architecture && !architecture.openings.some(o=>o.decision==='accept')) issue('No confirmed door or window was observed. Check whether this is an interior floor plan rather than a site/footprint map; add only source-supported openings.', architecture.openings);
  for (const wall of Array.isArray(raw?.walls) ? raw.walls : []) if (wall?.decision === 'uncertain') {
    const middle = isPoint(wall.start) && isPoint(wall.end) ? { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 } : undefined;
    issue(`${wall.label ?? 'Wall'}: uncertain source wall.`, wall, middle);
  }
  for (const [i, opening] of (Array.isArray(raw?.openings) ? raw.openings : []).entries()) {
    const unresolved = !draft || stage?.openingAudit[i]?.programStatus === 'unresolved-host';
    if (opening?.decision === 'reject' || !unresolved && opening?.decision !== 'uncertain') continue;
    const endpoints = opening?.endpoints, middle = Array.isArray(endpoints) && endpoints.length === 2 && endpoints.every(isPoint)
      ? { x: (endpoints[0].x + endpoints[1].x) / 2, y: (endpoints[0].y + endpoints[1].y) / 2 } : undefined;
    const message = opening?.decision === 'uncertain' ? 'source interpretation is uncertain'
      : stage?.openingAudit[i]?.programStatus === 'unresolved-host' ? 'needs a wall host; add or correct this opening in the plan editor'
      : stage?.openingAudit[i]?.programStatus === 'assembled' ? 'retained because a later assembly stage failed; its wall host was matched'
      : 'not assembled because an earlier source stage failed; wall-host matching has not been assessed';
    issue(`${opening?.label ?? 'Opening'}: ${message}.`, opening, middle);
  }
  for (const zone of Array.isArray(raw?.functionalZones) ? raw.functionalZones : []) if (zone?.decision === 'uncertain' || !draft && zone?.decision === 'accept') issue(`${zone.label}: source boundary needs review.`, zone, isPoint(zone.position) ? zone.position : undefined);
  const unresolvedZones = stage?.functionalZoneReview?.finalMetrics.zones.filter(z => !z.resolved) ?? [];
  for (const [i, finding] of (project.reconstruction?.observationReview?.zoneFindings ?? []).entries()) {
    const zone = raw?.functionalZones?.find((z: any) => z.label === finding.label);
    issue(`${finding.label}: ${finding.message}`, zone, unresolvedZones[i]?.sourcePosition ?? zone?.position);
  }
  if (issues.length) {
    // Retain both complete observations in the Project backup, not just a path
    // into a transient desktop session directory.
    project.architectureReview = { version: 1, issues, sourceObservations: JSON.stringify({ architecture: original, furnishing }), workingImageSha256: source.sha256 };
  }
  return { project: readProject(project), draft, audit: session.audit, stage, issueCount: issues.filter(i => !i.resolved).length };
}
