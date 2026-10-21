import { describe, expect, it } from 'vitest';
import { draftToProject } from '$lib/plan2world/draft';
import { reviewIndoorConnectivity } from '$lib/plan2world/indoorConnectivityReview';

function floor(door: boolean, exteriorDoors = false) {
  return draftToProject({ schemaVersion: 'plan2world-draft-v1', name: 'Connectivity test', units: 'cm',
    scale: { mode: 'measured', confidence: 1 }, floors: [{ id: 'f', name: 'floor', level: 0,
      walls: [
        { id: 'n', start: { x: 0, y: 0 }, end: { x: 600, y: 0 } },
        { id: 'e', start: { x: 600, y: 0 }, end: { x: 600, y: 400 } },
        { id: 's', start: { x: 600, y: 400 }, end: { x: 0, y: 400 } },
        { id: 'w', start: { x: 0, y: 400 }, end: { x: 0, y: 0 } },
        { id: 'p', start: { x: 340, y: 0 }, end: { x: 340, y: 400 } },
      ], doors: [
        ...(door ? [{ id: 'd', wallId: 'p', position: 0.5, width: 100 }] : []),
        ...(exteriorDoors ? [{ id: 'out-left', wallId: 'w', position: 0.5, width: 100 }, { id: 'out-right', wallId: 'e', position: 0.5, width: 100 }] : []),
      ], windows: [], furniture: [] }] }).floors[0];
}

describe('native indoor connectivity review', () => {
  it('finds an interior door route and its two native boundary regions', () => {
    const native = floor(true), before = JSON.stringify(native);
    const result = reviewIndoorConnectivity(native);
    expect(result.status).toBe('sampled');
    expect(result.rooms).toHaveLength(2);
    expect(result.rooms.every(room => room.reachableGridNodes > 0)).toBe(true);
    expect(result.doorLinks[0].roomIds).toHaveLength(2);
    expect(result.rooms.flatMap(room => room.findings)).toEqual([]);
    expect(JSON.stringify(native)).toBe(before);
  });

  it('reports a sealed neighbouring region without adding an entrance', () => {
    const native = floor(false), before = JSON.stringify(native);
    const result = reviewIndoorConnectivity(native);
    expect(result.rooms.filter(room => room.reachableGridNodes > 0)).toHaveLength(1);
    expect(result.rooms.some(room => room.findings.includes('not-reached-from-start'))).toBe(true);
    expect(result.rooms.every(room => room.findings.includes('no-door-on-boundary'))).toBe(true);
    expect(JSON.stringify(native)).toBe(before);
  });

  it('excludes an exterior detour even when both regions have exterior doors', () => {
    const result = reviewIndoorConnectivity(floor(false, true));
    expect(result.rooms.filter(room => room.reachableGridNodes > 0)).toHaveLength(1);
    expect(result.rooms.some(room => room.findings.includes('not-reached-from-start'))).toBe(true);
    expect(result.exteriorTraversalAllowed).toBe(false);
  });

  it('ignores furniture obstacles without mutating or removing the furniture', () => {
    const native = floor(true), result = reviewIndoorConnectivity(native);
    native.furniture.push({ id: 'block', catalogId: 'imported_object', position: { x: 340, y: 200 },
      width: 180, depth: 200, height: 100, rotation: 0, scale: { x: 1, y: 1, z: 1 } });
    const before = JSON.stringify(native);
    expect(reviewIndoorConnectivity(native)).toEqual(result);
    expect(JSON.stringify(native)).toBe(before);
  });

  it('reports a sampling budget limit as inconclusive', () => {
    const result = reviewIndoorConnectivity(floor(true), { maxGridCells: 1 });
    expect(result.status).toBe('sampling-budget-exceeded');
    expect(result.gridSeedFound).toBe(false);
    expect(result.rooms).toEqual([]);
  });
});
