import { get } from 'svelte/store';
import type { Point } from '$lib/models/types';
import { activeFloor, beginUndoGroup, currentProject, endUndoGroup } from './project';
import { buildFloorClearance, resolveClearancePoint } from '$lib/utils/floorClearance';

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Persist a collision-safe first-person start on the active floor as one undoable edit. */
export function setRuntimeStart(point: Point): Point | undefined {
  if (!finitePoint(point)) return undefined;
  const floor = get(activeFloor);
  if (!floor) return undefined;
  const resolved = resolveClearancePoint(point, buildFloorClearance(floor));
  if (!floor.entrance && floor.walkthroughStart?.x === resolved.x && floor.walkthroughStart?.y === resolved.y) return resolved;

  beginUndoGroup();
  try {
    currentProject.update(project => {
      if (!project) return project;
      const target = project.floors.find(item => item.id === project.activeFloorId);
      if (!target) return project;
      delete target.entrance;
      target.walkthroughStart = { ...resolved };
      project.updatedAt = new Date();
      return { ...project };
    });
  } finally {
    endUndoGroup('Set walkthrough start');
  }
  return resolved;
}

/** Remove the explicit start so the compiler chooses an automatic interior spawn. */
export function clearRuntimeStart() {
  const floor = get(activeFloor);
  if (!floor || (!floor.walkthroughStart && !floor.entrance)) return;
  beginUndoGroup();
  try {
    currentProject.update(project => {
      if (!project) return project;
      const target = project.floors.find(item => item.id === project.activeFloorId);
      if (!target) return project;
      delete target.walkthroughStart;
      delete target.entrance;
      project.updatedAt = new Date();
      return { ...project };
    });
  } finally {
    endUndoGroup('Cleared walkthrough start');
  }
}

/** Main door and inward side are author-supplied evidence, never engine guesses. */
export function setRuntimeEntrance(doorId: string, side: 'left' | 'right') {
  const floor = get(activeFloor);
  if (!floor?.doors.some(door => door.id === doorId)) return;
  beginUndoGroup();
  try {
    currentProject.update(project => {
      if (!project) return project;
      for (const item of project.floors) delete item.entrance;
      const target = project.floors.find(item => item.id === floor.id)!;
      target.entrance = { doorId, side };
      delete target.walkthroughStart;
      project.updatedAt = new Date();
      return { ...project };
    });
  } finally { endUndoGroup('Set main entrance'); }
}
