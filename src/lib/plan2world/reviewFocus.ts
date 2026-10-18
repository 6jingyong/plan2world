import type { Project } from '$lib/models/types';
import type { DraftGeometryIssue } from './geometryHealth';

export type ReviewFocusMode = 'edit' | 'inspect';

/** Aggregate diagnostics identify an area to inspect, not a wall to delete. */
export function reviewIssueFocusMode(issue: Pick<DraftGeometryIssue, 'code'>): ReviewFocusMode {
  return ['many-enclosed-regions', 'high-region-wall-ratio', 'many-tiny-regions', 'disconnected-component'].includes(issue.code)
    ? 'inspect' : 'edit';
}

export interface ReviewFocusTarget {
  floorId: string;
  /** All related geometry used to frame the finding, not selection membership. */
  elementIds: string[];
  /** The single subject to edit/delete, or null for an aggregate inspection. */
  primaryId: string | null;
}

/**
 * Resolve a Review finding into editor-selectable deterministic geometry.
 * Walls, openings and explicit ground outlines use native editor selection.
 * Reconstruction findings never target furniture or presentation-only elements.
 */
export function resolveReviewFocus(
  project: Project,
  floorId: string | null | undefined,
  requestedIds: readonly string[],
  mode: ReviewFocusMode = 'edit',
): ReviewFocusTarget | null {
  if (!floorId) return null;
  const floor = project.floors.find(item => item.id === floorId);
  if (!floor) return null;

  const selectable = new Set([
    ...floor.walls.map(item => item.id),
    ...floor.doors.map(item => item.id),
    ...floor.windows.map(item => item.id),
    ...floor.rooms.filter(item => item.boundary).map(item => item.id),
  ]);
  // In edit mode the first requested ID is the subject. An obsolete finding must not
  // retarget its surviving host/neighbor when that subject has been deleted.
  if (!requestedIds.length || (mode === 'edit' && !selectable.has(requestedIds[0]))) return null;
  const seen = new Set<string>();
  const elementIds = requestedIds.filter(id => {
    if (!selectable.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!elementIds.length) return null;

  return { floorId, elementIds, primaryId: mode === 'inspect' ? null : elementIds[0] };
}
