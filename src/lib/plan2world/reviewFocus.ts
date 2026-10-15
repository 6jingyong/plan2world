import type { Project } from '$lib/models/types';

export interface ReviewFocusTarget {
  floorId: string;
  elementIds: string[];
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
  const seen = new Set<string>();
  const elementIds = requestedIds.filter(id => {
    if (!selectable.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!elementIds.length) return null;

  return { floorId, elementIds, primaryId: elementIds[0] };
}
