import { compileRuntimeScene } from '../runtime/compileRuntimeScene';
import { reviewDoorGeometry } from '../runtime/doorGeometryReview';
import type { SourceCorrectionResult } from './correction';
import type { SourceArchitectureV1 } from './architecture';
import type { SourceDiagnostic } from './sourceDiagnostics';

export interface FeedbackDoorReview {
  status: 'assessed' | 'incomplete' | 'not-assessed';
  findings: { code: 'door-closed-overlap' | 'door-motion-overlap'; openingPath: string;
    blockerPaths: string[]; hostPaths: string[]; entityId: string; blockerId: string }[];
  unmappedEntityIds: string[];
  uncheckedDoorIds: string[];
  unassessedOpeningPaths: string[];
  error?: string;
}

/** Compiler primitives locate a question; they do not establish source error.
 * Exact feature ownership survives splitting/merging; native ID spelling never
 * supplies a source index. The runtime and original observations stay untouched. */
export function inspectFeedbackDoors(result: SourceCorrectionResult, architecture: SourceArchitectureV1,
  runtime = () => compileRuntimeScene(result.project)) {
  const review: FeedbackDoorReview = { status: 'not-assessed', findings: [], unmappedEntityIds: [], uncheckedDoorIds: [], unassessedOpeningPaths: [] };
  const diagnostics: SourceDiagnostic[] = [];
  try {
    const scene = runtime(), check = reviewDoorGeometry(scene);
    review.unassessedOpeningPaths = architecture.openings.flatMap((opening, index) => {
      if (opening.decision !== 'accept' || opening.kind !== 'door') return [];
      const path = `openings[${index}]`, feature = result.features.find(f => f.path === path && f.kind === 'opening');
      return feature?.status === 'retained' && feature.nativeIds.length && feature.nativeIds.every(id => scene.entities.some(e => e.kind === 'door' && e.id === id)) ? [] : [path];
    });
    const owners = (id: string, kind: 'wall' | 'opening') => result.features
      .filter(f => f.kind === kind && f.status === 'retained' && f.nativeIds.includes(id))
      .map(f => f.path).filter(path => {
        const match = /^(walls|openings)\[(0|[1-9]\d*)\]$/.exec(path);
        return match && architecture[match[1] as 'walls'][Number(match[2])];
      });
    const unmapped = new Set<string>();
    for (const finding of check.findings) {
      const openings = owners(finding.openingId, 'opening');
      const entity = scene.entities.find(e => e.kind === 'door' && e.id === finding.openingId);
      const hostPaths = entity?.kind === 'door' ? owners(entity.hostWallId, 'wall') : [];
      if (openings.length !== 1 || !hostPaths.length) {
        unmapped.add(finding.openingId); continue;
      }
      const openingPath = openings[0], index = Number(/^openings\[(\d+)\]$/.exec(openingPath)![1]);
      const opening = architecture.openings[index];
      for (const blockerId of finding.blockerIds) {
        const blockerPaths = [...new Set([...owners(blockerId, 'wall'), ...owners(blockerId, 'opening')])].sort();
        if (!blockerPaths.length) { unmapped.add(blockerId); continue; }
        review.findings.push({ code: finding.code, openingPath, blockerPaths, hostPaths, entityId: finding.openingId, blockerId });
        diagnostics.push({ id: `door-review-${review.findings.length}`, code: finding.code, phase: 'assembly', category: 'root',
          message: 'The current compiled door meets architectural geometry. Reinspect the aperture, adjoining boundaries and motion evidence; defaults or representation can be responsible. Collision is not visual proof of an incorrect source record.',
          sourcePaths: [...new Set([openingPath, ...hostPaths, ...blockerPaths])], blockedBy: [], sourceRecord: opening,
          position: { x: (opening.endpoints[0].x + opening.endpoints[1].x) / 2, y: (opening.endpoints[0].y + opening.endpoints[1].y) / 2 } });
      }
    }
    review.unmappedEntityIds = [...unmapped].sort();
    review.uncheckedDoorIds = [...check.uncheckedDoorIds];
    review.status = check.status === 'checked' && !review.unassessedOpeningPaths.length ? 'assessed' : 'incomplete';
  } catch (error) { review.error = error instanceof Error ? error.message : String(error); }
  return { review, diagnostics };
}

/** Compare source-owned conflict identities, independent of generated IDs.
 * A wall split may repeat a conflict; preserve set semantics, not warning counts. */
export function doorConflictKeys(review: FeedbackDoorReview) {
  return [...new Set(review.findings.flatMap(f => f.blockerPaths.map(path => JSON.stringify([f.code, f.openingPath, path]))))].sort();
}
