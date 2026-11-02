import { parseSourceFurnishing, type SourceArchitectureV1 } from './architecture';
import type { SourceCorrectionResult } from './correction';
import type { SourceDiagnostic } from './sourceDiagnostics';
import { compileRuntimeScene } from '../runtime/compileRuntimeScene';
import { inspectFeedbackSupport, type FeedbackSupportReview } from './visualFeedbackSupport';
import { inspectFeedbackDoors, doorConflictKeys, type FeedbackDoorReview } from './visualFeedbackDoors';
import { evaluateNativeLogicalUse, preservesLogicalUse, type LogicalUseMetrics } from './logicalGeometryConstraints';

export const sourceVisualQuestionCodes = new Set(['wall-overlap','ambiguous-host','unresolved-host','uncertain-wall','uncertain-opening','uncertain-zone','unresolved-zone','source-marker-no-floor','door-closed-overlap','door-motion-overlap']);

export interface StructuralReview {
  status: 'assessed' | 'incomplete';
  support: FeedbackSupportReview;
  doors: FeedbackDoorReview;
  use?: LogicalUseMetrics;
  anchors: { path: string; position: {x:number;y:number} }[];
  apertures: { path: string; kind: string; width: number; clear: boolean }[];
  retainedFurniturePaths: string[];
  resolvedZonePaths: string[];
  routes: { diagnosticId: string; route: 'visual' | 'program-assumption' | 'deferred'; reason: string }[];
  deferredAnchorPaths: string[];
  errors: string[];
  limitation: string;
}

/** One read-only native assessment shared by all candidate guards. No IDs are
 * inferred from their spelling, and no source points or runtime poses are moved.
 * The full audit stays local; only bounded source questions enter the prompt. */
export function inspectStructuralReview(result: SourceCorrectionResult, architecture: SourceArchitectureV1,
  furnishing: unknown, source: {width:number;height:number}, furnitureSourceIndices?: number[]) {
  let compiled: ReturnType<typeof compileRuntimeScene> | undefined, failure: unknown, attempted = false;
  const runtime = () => {
    if (!attempted) {
      attempted = true;
      try { compiled = compileRuntimeScene(result.project); } catch (error) { failure = error; }
    }
    if (!compiled) throw failure;
    return compiled;
  };
  const support = inspectFeedbackSupport(result, furnishing, architecture, runtime);
  const doors = inspectFeedbackDoors(result, architecture, runtime);
  const originalPath = (path: string) => {
    const match = /^furniture\[(\d+)\]$/.exec(path);
    return match && furnitureSourceIndices ? `furniture[${furnitureSourceIndices[Number(match[1])]}]` : path;
  };
  support.review.findings = support.review.findings.map(f => ({...f, path: originalPath(f.path)}));
  support.diagnostics = support.diagnostics.map(d => ({...d, sourcePaths: d.sourcePaths.map(originalPath)}));
  const report: StructuralReview = { status: 'incomplete', support: support.review, doors: doors.review,
    anchors: [], apertures: [], retainedFurniturePaths: [], resolvedZonePaths: [], routes: [], deferredAnchorPaths: [], errors: [],
    limitation: 'Positive enclosure, direct clearance and door links are preservation evidence, not complete route finding or source truth. Unproven routes remain unknown. Native motion defaults are program assumptions.' };
  try {
    const rows = parseSourceFurnishing(furnishing, architecture.scaleEvidence).furniture;
    const anchors = [
      ...(architecture.functionalZones ?? []).flatMap((z,i) => z.decision === 'reject' ? [] : [{path:`functionalZones[${i}]`,position:z.position}]),
      ...rows.map((f,i) => ({path:originalPath(`furniture[${i}]`),position:f.position})),
    ];
    report.anchors = anchors.slice(0,64);
    report.deferredAnchorPaths = anchors.slice(64).map(a => a.path);
    const floor = result.project.floors[0], background = floor?.backgroundImage;
    if (result.project.floors.length !== 1 || !background) throw new Error('A single registered source floor is required for logical-use assessment.');
    if (background.reconstructionSource?.width!==source.width || background.reconstructionSource.height!==source.height) throw new Error('Source dimensions do not match native image registration.');
    const angle = background.rotation * Math.PI / 180;
    const positions = report.anchors.map(({position:p}) => {
      const x = (p.x-source.width/2)*background.scale, y = (p.y-source.height/2)*background.scale;
      return {x:background.position.x+Math.cos(angle)*x-Math.sin(angle)*y,
        y:background.position.y+Math.sin(angle)*x+Math.cos(angle)*y};
    });
    report.use = evaluateNativeLogicalUse(floor, positions);
    report.retainedFurniturePaths = result.features.filter(f=>f.kind==='furniture' && f.status==='retained'
      && f.nativeIds.length && f.nativeIds.every(id=>floor.furniture.some(item=>item.id===id))).map(f=>originalPath(f.path));
    if (rows.some((_,i)=>!report.retainedFurniturePaths.includes(originalPath(`furniture[${i}]`)))) report.errors.push('Observed furniture ownership or assembly is incomplete.');
    report.resolvedZonePaths = result.features.filter(f=>f.kind==='zone'&&f.status==='retained').map(f=>f.path);
    architecture.openings.forEach((opening,i)=>{
      if (opening.decision==='accept' && !result.features.some(f=>f.kind==='opening' && f.path===`openings[${i}]` && f.status==='retained' && f.nativeIds.length)) {
        report.errors.push(`Accepted source aperture openings[${i}] is unassembled.`);
      }
    });
    for (const feature of result.features.filter(f => f.kind === 'opening' && f.status === 'retained')) {
      const opening = [...floor.doors, ...floor.windows].filter(o => feature.nativeIds.includes(o.id));
      if (opening.length !== feature.nativeIds.length) throw new Error('Retained aperture ownership is incomplete.');
      const kind = architecture.openings[Number(/^openings\[(\d+)\]$/.exec(feature.path)?.[1])]?.kind;
      if (!kind) throw new Error('Retained aperture has no source record.');
      report.apertures.push({path:feature.path,kind,width:opening.reduce((sum,o)=>sum+o.width,0),
        clear:kind==='door' && opening.every(o => report.use!.clearDoorIds.includes(o.id))});
    }
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)); }
  const diagnostics = [...result.diagnostics, ...support.diagnostics, ...doors.diagnostics];
  const visualDiagnostics: SourceDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    // A default full-span sliding panel can fail mechanically while the drawn
    // aperture is right. Retain that finding without spending a source retry.
    const finding = doors.review.findings.find((_,i) => diagnostic.id === `door-review-${i+1}`);
    const native = finding ? result.project.floors.flatMap(f=>f.doors).find(d=>d.id===finding.entityId) : undefined;
    const defaultSlide = diagnostic.code === 'door-motion-overlap' && native
      && ['sliding','pocket'].includes(native.type) && native.leafConfiguration?.kind !== 'sliding';
    const route = defaultSlide ? 'program-assumption' : diagnostic.category === 'blocked' || !diagnostic.sourcePaths.length
      || !sourceVisualQuestionCodes.has(diagnostic.code) ? 'deferred' : 'visual';
    report.routes.push({diagnosticId:diagnostic.id,route,reason:defaultSlide
      ? 'Motion-only conflict under the default full-span panel; inspect native configuration before requesting more image evidence.'
      : route==='deferred' ? 'Dependent or unmapped finding; preserve its root question and audit.' : 'Localized source evidence can distinguish interpretations.'});
    if (route === 'visual') visualDiagnostics.push(diagnostic);
  }
  report.status = report.use && !report.errors.length && !report.deferredAnchorPaths.length
    && report.support.status==='assessed' && !report.support.unmappedEntityIds.length
    && report.doors.status==='assessed' && !report.doors.unmappedEntityIds.length ? 'assessed' : 'incomplete';
  return {report, diagnostics:visualDiagnostics};
}

/** Stable assessment binding: source paths and logical facts, never generated
 * room/floor IDs or unbounded geometry in the model request. */
export function structuralReviewBinding(report: StructuralReview) {
  const {clearDoorIds: _nativeIds, ...use} = report.use ?? {clearDoorIds:[]};
  return {status:report.status,use,anchors:report.anchors,apertures:report.apertures,
    retainedFurniturePaths:report.retainedFurniturePaths,resolvedZonePaths:report.resolvedZonePaths,
    support:{status:report.support.status,paths:report.support.findings.map(f=>f.path),unmapped:report.support.unmappedEntityIds.length},
    doors:{status:report.doors.status,conflicts:doorConflictKeys(report.doors),unmapped:report.doors.unmappedEntityIds.length,
      unchecked:report.doors.uncheckedDoorIds.length,unassessedOpeningPaths:report.doors.unassessedOpeningPaths},
    deferredAnchorPaths:report.deferredAnchorPaths,errorCount:report.errors.length};
}

/** All applicable invariants run, independent of which question triggered the
 * crop. Existing findings may remain; a lower warning count is never a winner. */
export function compareStructuralReviews(before: StructuralReview, after: StructuralReview, changedPaths: string[] = []) {
  const reasons: string[] = [], changed = new Set(changedPaths);
  if (before.status !== 'assessed' || after.status !== 'assessed') reasons.push('structural-check-incomplete');
  const priorSupport = new Set(before.support.findings.map(f=>f.path));
  if (after.support.findings.some(f=>!priorSupport.has(f.path))) reasons.push('new-unsupported-source-anchor');
  const priorDoor = new Set(doorConflictKeys(before.doors));
  if (doorConflictKeys(after.doors).some(key=>!priorDoor.has(key))) reasons.push('new-door-geometry-conflict');
  if (before.retainedFurniturePaths.some(path=>!changed.has(path)&&!after.retainedFurniturePaths.includes(path))) reasons.push('unchanged-furniture-lost');
  if (before.resolvedZonePaths.some(path=>!changed.has(path)&&!after.resolvedZonePaths.includes(path))) reasons.push('resolved-functional-zone-lost');
  for (const aperture of before.apertures.filter(a=>!changed.has(a.path))) {
    const next = after.apertures.find(a=>a.path===aperture.path);
    if (!next || next.kind!==aperture.kind || Math.abs(next.width-aperture.width)>1e-5) reasons.push('unchanged-opening-lost-or-resized');
    if (aperture.clear && !next?.clear) reasons.push('existing-door-clearance-lost');
  }
  const indices = before.anchors.flatMap((a,i)=>changed.has(a.path) ? [] : [i]);
  const nextIndices = indices.map(i=>after.anchors.findIndex(a=>a.path===before.anchors[i].path));
  if (nextIndices.some(i=>i<0)) reasons.push('unchanged-anchor-lost');
  else if (before.use && after.use) {
    const subset = (use: LogicalUseMetrics, selected: number[]) => ({
      closed:selected.map(i=>use.closed[i]), blocked:selected.map(i=>use.blocked[i]), entrances:selected.map(i=>use.entrances[i]),
      sameRegion:selected.map(i=>selected.map(j=>use.sameRegion[i][j])), reachable:selected.map(i=>selected.map(j=>use.reachable[i][j])),
    });
    const reason = preservesLogicalUse(subset(before.use,indices),subset(after.use,nextIndices),true);
    if (reason) reasons.push(reason);
  }
  return {eligible:reasons.length===0,reasons:[...new Set(reasons)]};
}
