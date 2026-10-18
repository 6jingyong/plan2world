import { get, writable } from 'svelte/store';
import { currentProject, selectedRoomId, selectedTool, selectSingleElement, setActiveFloor, viewMode } from './project';
import { resolveReviewFocus, type ReviewFocusTarget } from '$lib/plan2world/reviewFocus';

/** One-shot handoff from reconstruction Review to the live 2D editor canvas. */
export const editorFocusRequest = writable<ReviewFocusTarget | null>(null);

/** Related geometry frames the finding; only its subject becomes an edit/delete target. */
export function focusReviewTarget(target: ReviewFocusTarget): boolean {
  const project = get(currentProject);
  const resolved = project ? resolveReviewFocus(project, target.floorId, target.elementIds, target.primaryId === null ? 'inspect' : 'edit') : null;
  // A stale subject must not silently turn its host or neighbor into the edit target.
  if (!resolved || (target.primaryId !== null && !resolved.elementIds.includes(target.primaryId))) return false;
  viewMode.set('2d');
  setActiveFloor(target.floorId);
  selectedTool.set('select');
  const isArea = project!.floors.find(floor => floor.id === target.floorId)?.rooms.some(room => room.id === target.primaryId && room.boundary);
  selectSingleElement(isArea ? null : target.primaryId);
  selectedRoomId.set(isArea ? target.primaryId : null);
  editorFocusRequest.set({ ...resolved, primaryId: target.primaryId });
  return true;
}
