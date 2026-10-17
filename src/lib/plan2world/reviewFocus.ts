import type { Project } from '$lib/models/types';

export interface ReviewFocusTarget {
  floorId: string;
  /** All related geometry used to frame the finding, not selection membership. */
  elementIds: string[];
  /** The single subject to edit or delete. */
  primaryId: string;
}

/**
 * Resolve a Review finding into editor-selectable deterministic geometry.
 * Only walls and openings are accepted because reconstruction findings never
 * target furniture or presentation-only elements.
 */
export function resolveReviewFocus(
  project: Project,
  floorId: string | null | undefined,
  requestedIds: readonly string[],
): ReviewFocusTarget | null {
  if (!floorId) return null;
  const floor = project.floors.find(item => item.id === floorId);
  if (!floor) return null;

  const selectable = new Set([
    ...floor.walls.map(item => item.id),
    ...floor.doors.map(item => item.id),
    ...floor.windows.map(item => item.id),
  ]);
  // The first requested ID is the subject. An obsolete finding must not
  // retarget its surviving host/neighbor when that subject has been deleted.
  if (!requestedIds.length || !selectable.has(requestedIds[0])) return null;
  const seen = new Set<string>();
  const elementIds = requestedIds.filter(id => {
    if (!selectable.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!elementIds.length) return null;

  return { floorId, elementIds, primaryId: elementIds[0] };
}
