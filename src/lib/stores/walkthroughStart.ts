import { get } from 'svelte/store';
import type { Point } from '$lib/models/types';
import { activeFloor, beginUndoGroup, currentProject, endUndoGroup } from './project';
import { createWalkthroughCollisionWorld, resolveWalkthroughStart } from '$lib/utils/walkthroughCollision';

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Resolve the saved first-person start against the floor's current collision geometry. */
export function resolvedActiveWalkthroughStart(): Point | undefined {
  const floor = get(activeFloor);
  if (!floor?.walkthroughStart || !finitePoint(floor.walkthroughStart)) return undefined;
  return resolveWalkthroughStart(floor.walkthroughStart, createWalkthroughCollisionWorld(floor));
}

/** Persist a collision-safe first-person start on the active floor as one undoable edit. */
export function setWalkthroughStart(point: Point): Point | undefined {
  if (!finitePoint(point)) return undefined;
  const floor = get(activeFloor);
  if (!floor) return undefined;
  const resolved = resolveWalkthroughStart(point, createWalkthroughCollisionWorld(floor));
  if (floor.walkthroughStart?.x === resolved.x && floor.walkthroughStart?.y === resolved.y) return resolved;

  beginUndoGroup();
  try {
    currentProject.update(project => {
      if (!project) return project;
      const target = project.floors.find(item => item.id === project.activeFloorId);
      if (!target) return project;
      target.walkthroughStart = { ...resolved };
      project.updatedAt = new Date();
      return { ...project };
    });
  } finally {
    endUndoGroup('Set walkthrough start');
  }
  return resolved;
}

/** Remove the explicit start so the viewer falls back to automatic room-centre placement. */
export function clearWalkthroughStart() {
  const floor = get(activeFloor);
  if (!floor?.walkthroughStart) return;
  beginUndoGroup();
  try {
    currentProject.update(project => {
      if (!project) return project;
      const target = project.floors.find(item => item.id === project.activeFloorId);
      if (!target?.walkthroughStart) return project;
      delete target.walkthroughStart;
      project.updatedAt = new Date();
      return { ...project };
    });
  } finally {
    endUndoGroup('Cleared walkthrough start');
  }
}
