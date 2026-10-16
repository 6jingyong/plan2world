import { derived, type Readable } from 'svelte/store';
import type { Project } from '$lib/models/types';
import { analyzeFloor, type FloorAnalysis } from '$lib/utils/floorAnalysis';

/** One cache per project source, independent of any mounted editor or viewer.
 * Value signatures are required because editor gestures mutate walls in place.
 * Only transient room identity survives recomputation; metadata comes from Floor.
 */
export function createProjectFloorAnalysis(source: Readable<Project | null>) {
  let projectId: string | undefined;
  const cache = new Map<string, { signature: string; analysis: FloorAnalysis }>();
  return derived(source, project => {
    if (projectId !== project?.id) cache.clear();
    projectId = project?.id;
    const floors = new Map<string, FloorAnalysis>();
    for (const floor of project?.floors ?? []) {
      const signature = JSON.stringify([floor.walls, floor.rooms]);
      const previous = cache.get(floor.id);
      const analysis = previous?.signature === signature
        ? { ...previous.analysis, floor }
        : analyzeFloor(floor, previous?.analysis.rooms);
      cache.set(floor.id, { signature, analysis });
      floors.set(floor.id, analysis);
    }
    for (const id of cache.keys()) if (!floors.has(id)) cache.delete(id);
    return { floors, active: floors.get(project?.activeFloorId ?? '') ?? floors.values().next().value ?? null };
  });
}
