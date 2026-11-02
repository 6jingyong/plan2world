import { compileRuntimeScene } from '../runtime/compileRuntimeScene';
import { reviewDoorGeometry } from '../runtime/doorGeometryReview';
import type { SourceCorrectionResult } from './correction';

/** Read-only explanation for the HUMAN review report. These are current native
 * and compiler choices, never newly observed source evidence. Keeping this
 * outside the model request preserves frozen v1/v2/v3 request identities. */
export function inspectFeedbackMotionContext(result: SourceCorrectionResult) {
  const doors: { entityId: string; sourcePaths: string[]; basis: 'default-full-span' | 'explicit-panels';
    openingSpanCm: number; panels: { id: string; widthCm: number; travelCm: number; fixed: boolean }[] }[] = [];
  const deferredDoorIds: string[] = [], unmappedDoorIds: string[] = [];
  const scope = 'Current native/compiled sliding motion only; not source evidence, an inferred clear opening, a suggested configuration or engine acceptance.';
  try {
    const scene = compileRuntimeScene(result.project), check = reviewDoorGeometry(scene);
    const conflicts = new Set(check.findings.map(f => f.openingId));
    for (const entity of scene.entities) {
      if (entity.kind !== 'door' || entity.interaction.kind !== 'slide' || !conflicts.has(entity.id)) continue;
      if (doors.length >= 24) { deferredDoorIds.push(entity.id); continue; }
      const native = result.project.floors.find(f => f.id === entity.floorId)?.doors.find(d => d.id === entity.id);
      if (!native) throw new Error('Compiled door has no matching canonical owner.');
      const sourcePaths = result.features.filter(f => f.kind === 'opening' && f.status === 'retained' && f.nativeIds.includes(entity.id)).map(f => f.path);
      if (sourcePaths.length !== 1) unmappedDoorIds.push(entity.id);
      doors.push({ entityId: entity.id, sourcePaths, basis: native.leafConfiguration?.kind === 'sliding' ? 'explicit-panels' : 'default-full-span',
        openingSpanCm: native.width, panels: entity.interaction.leaves.map(leaf => ({ id: leaf.id, widthCm: leaf.size[0] * 100,
          travelCm: leaf.travel * 100, fixed: leaf.fixed === true })) });
    }
    return { status: check.status, scope, doors, deferredDoorIds, unmappedDoorIds, uncheckedDoorIds: check.uncheckedDoorIds };
  } catch (error) {
    return { status: 'unavailable' as const, scope, doors, deferredDoorIds, unmappedDoorIds, uncheckedDoorIds: [] as string[],
      error: error instanceof Error ? error.message : String(error) };
  }
}
