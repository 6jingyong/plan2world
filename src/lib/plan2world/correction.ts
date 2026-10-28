import type { Point, Project } from '../models/types';
import { readProject } from '../utils/projectValidation';
import { assembleFrozenArchitecture, type SourceArchitectureV1, type prepareArchitectureStage } from './architecture';
import { SourceRecoverySession, SourceRecoveryRequired } from './sourceRecovery';
import { draftToProjectWithSourceBackground, type SourceFloorPlanImage } from './sourceBackground';
import { summarizeArchitectureObservation } from './review';
import { buildArchitectureInstructions, buildReconstructionInstructions, type ReconstructionOptions } from './reconstructionInstructions';
import type { SourceRasterPixels } from './rasterWallContinuation';
import type { Plan2WorldDraft } from './draft';
import { projectSourceForCorrection } from './correctionProjection';
import { isSourcePoint as isPoint, sourceDiagnostic, type SourceDiagnostic, type SourceFeatureOutcome } from './sourceDiagnostics';
import { imageSha256 } from './imagePreparation';

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
  const recordFailure = (e: unknown) => {
    if (e instanceof SourceRecoveryRequired) {
      if (e.request?.phase === 'opening-hosts' || stage && e.audit.failures.at(-1)?.phase === 'opening-hosts') return;
      failures.push(e.request?.issue.message ?? errorMessage(e));
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
  const partialImport = !project;
  let diagnostics: SourceDiagnostic[] = [], features: SourceFeatureOutcome[] = [];
  if (!project) {
    const partial = projectSourceForCorrection(raw, furnishing, source.image, failures.join('; ') || 'Source assembly did not complete.');
    project = partial.project; diagnostics = partial.diagnostics; features = partial.features;
    // A partial authoring projection is never advertised as a completed draft.
    draft = undefined;
  }

  const floor = project.floors[0];
  const issues: NonNullable<Project['architectureReview']>['issues'] = [];
  const sourcePoint = (p?: Point) => {
    const bg = floor.backgroundImage;
    if (!p || !bg || !isPoint(p) || p.x < 0 || p.y < 0 || p.x > source.image.width || p.y > source.image.height) return undefined;
    const a = bg.rotation * Math.PI / 180, x = (p.x - source.image.width / 2) * bg.scale, y = (p.y - source.image.height / 2) * bg.scale;
    const result = { x: bg.position.x + Math.cos(a) * x - Math.sin(a) * y, y: bg.position.y + Math.sin(a) * x + Math.cos(a) * y };
    return isPoint(result) ? result : undefined;
  };
  const issue = (message: string, record?: unknown, position?: Point, code = 'source-review', paths: string[] = [], category: SourceDiagnostic['category'] = 'root', blockedBy: string[] = []) => {
    const d = sourceDiagnostic(diagnostics, code, code.includes('host') ? 'opening-hosts' : 'assembly', message, paths, record, category, blockedBy);
    if (position) d.position = position;
  };
  if (!partialImport) {
    for (const text of [...new Set(failures)]) issue(text, undefined, undefined, 'pipeline-failure');
  }
  if(architecture && !architecture.openings.some(o=>o.decision==='accept')) issue('No confirmed door or window was observed. Check whether this is an interior floor plan rather than a site/footprint map; add only source-supported openings.', architecture.openings);
  for (const [i, wall] of (Array.isArray(raw?.walls) ? raw.walls : []).entries()) if (wall?.decision === 'uncertain') {
    const middle = isPoint(wall.start) && isPoint(wall.end) ? { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 } : undefined;
    issue(`${wall.label ?? 'Wall'}: uncertain source wall.`, wall, middle, 'uncertain-wall', [`walls[${i}]`], 'uncertain');
  }
  for (const [i, opening] of (Array.isArray(raw?.openings) ? raw.openings : []).entries()) {
    if (partialImport) {
      if (opening?.decision === 'uncertain') issue(`${opening.label ?? 'Opening'}: source interpretation is uncertain.`, opening, undefined, 'uncertain-opening', [`openings[${i}]`], 'uncertain');
      continue;
    }
    const unresolved = stage?.openingAudit[i]?.programStatus === 'unresolved-host';
    if (opening?.decision === 'reject' || !unresolved && opening?.decision !== 'uncertain') continue;
    const endpoints = opening?.endpoints, middle = Array.isArray(endpoints) && endpoints.length === 2 && endpoints.every(isPoint)
      ? { x: (endpoints[0].x + endpoints[1].x) / 2, y: (endpoints[0].y + endpoints[1].y) / 2 } : undefined;
    const message = opening?.decision === 'uncertain' ? 'source interpretation is uncertain'
      : 'needs a wall host; add or correct this opening in the plan editor';
    issue(`${opening?.label ?? 'Opening'}: ${message}.`, opening, middle, opening?.decision === 'uncertain' ? 'uncertain-opening' : 'unresolved-host', [`openings[${i}]`], opening?.decision === 'uncertain' ? 'uncertain' : 'root');
  }
  for (const [i, zone] of (Array.isArray(raw?.functionalZones) ? raw.functionalZones : []).entries()) if (zone?.decision === 'uncertain') issue(`${zone.label}: source boundary needs review.`, zone, isPoint(zone.position) ? zone.position : undefined, 'uncertain-zone', [`functionalZones[${i}]`], 'uncertain');
  const unresolvedZones = stage?.functionalZoneReview?.finalMetrics.zones.filter(z => !z.resolved) ?? [];
  for (const [i, finding] of (project.reconstruction?.observationReview?.zoneFindings ?? []).entries()) {
    const zone = raw?.functionalZones?.find((z: any) => z.label === finding.label);
    const zi = raw?.functionalZones?.indexOf(zone) ?? -1;
    issue(`${finding.label}: ${finding.message}`, zone, unresolvedZones[i]?.sourcePosition ?? zone?.position, 'unresolved-zone', zi < 0 ? [] : [`functionalZones[${zi}]`]);
  }
  if (!partialImport && stage) {
    features = stage.wallAudit.map((w, i) => ({ path: `walls[${i}]`, kind: 'wall', status: w.decision === 'accept' ? 'retained' : w.decision === 'reject' ? 'rejected' : 'uncertain', nativeIds: w.normalizedWallIds ?? [], blockedBy: [] }));
    features.push(...stage.openingAudit.map((o, i): SourceFeatureOutcome => ({ path: `openings[${i}]`, kind: 'opening',
      status: o.decision === 'reject' ? 'rejected' : o.decision === 'uncertain' ? 'uncertain' : o.programStatus === 'assembled' ? 'retained' : 'unresolved-host',
      nativeIds: o.programStatus === 'assembled' ? o.outputIds ?? (o.outputId ? [o.outputId] : []) : [], hostAssessed: o.decision === 'accept', blockedBy: [] })));
    features.push(...(stage.architecture.functionalZones ?? []).map((z, i): SourceFeatureOutcome => ({ path: `functionalZones[${i}]`, kind: 'zone',
      status: z.decision === 'reject' ? 'rejected' : z.decision === 'uncertain' ? 'uncertain' : stage!.functionalZoneReview?.finalMetrics.zones.find(s => s.label === z.label)?.resolved ? 'retained' : 'not-assessed', nativeIds: [], blockedBy: [] })));
    features.push(...floor.furniture.map((f, i): SourceFeatureOutcome => ({ path: `furniture[${i}]`, kind: 'furniture', status: 'retained', nativeIds: [f.id], blockedBy: [] })));
  }
  for (const f of features) if (!f.blockedBy.length && f.status !== 'retained' && f.status !== 'rejected') f.blockedBy = diagnostics.filter(d => d.sourcePaths.includes(f.path)).map(d => d.id);
  for (const d of diagnostics) issues.push({ id: d.id, floorId: floor.id, message: d.message, code: d.code, phase: d.phase, category: d.category, sourcePaths: d.sourcePaths, blockedBy: d.blockedBy,
    ...(d.position ? { position: sourcePoint(d.position) } : {}), ...(d.sourceRecord === undefined ? {} : { sourceRecord: JSON.stringify(d.sourceRecord) }), resolved: false });
  if (issues.length) {
    project.architectureReview = { version: 1, issues, sourceObservations: JSON.stringify({ architecture: original, furnishing }), workingImageSha256: source.sha256 };
  }
  const canonical = readProject(project);
  const projectContentSha256 = await imageSha256(new TextEncoder().encode(JSON.stringify(canonical)));
  const audit = { ...session.audit, correction: { partialImport, diagnostics, features, projectContentSha256 } };
  return { project: canonical, draft, audit, stage, partialImport, diagnostics, features, issueCount: issues.filter(i => !i.resolved).length };
}
