import { describe, expect, it } from 'vitest';
import { deriveSourceOpenings } from '$lib/plan2world/sourceOpenings';
import { BARE_HOUSE_VERSION, SOURCE_WALL_TRACE_VERSION } from '$lib/plan2world/bareHouse';
import { planOpening } from '$lib/utils/planOpening';

function bareHouse(walls: any[]) {
  return {
    schemaVersion: BARE_HOUSE_VERSION,
    sourceSchemaVersion: SOURCE_WALL_TRACE_VERSION,
    walls,
    enclosures: [],
    sourceWallMap: Object.fromEntries(walls.map(wall => [wall.id, [wall.id]])),
    junctions: [],
    virtualSplitCount: 0,
    snappedEndpointCount: 0,
    maxJunctionDistancePx: 3,
    limitation: 'test',
  };
}

function trace(): any {
  return {
    cmPerPixel: 2,
    bareHouse: bareHouse([{ id: 'w', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }]),
    openings: [{
      id: 'd', kind: 'door', wallId: 'w', endpoints: [{ x: 50, y: 0 }, { x: 250, y: 0 }],
      evidence: 'Visible frame/jambs and two opposing swing arcs', doorType: 'double', typeEvidence: 'Two leaves share one jamb-to-jamb aperture',
    }],
  };
}

describe('source opening review', () => {
  it('matches a unique straight window with bounded independent pixel rounding error', () => {
    const input = trace(); input.openings = [{ id: 'n', kind: 'window', endpoints: [{ x: 40, y: 3.2 }, { x: 180, y: 2.8 }], evidence: 'Approximate glazing ends.' }];
    const before = JSON.stringify(input), result = deriveSourceOpenings(input);
    expect(result.windows).toHaveLength(1);
    expect(result.sourceIntervals[0].hostResolution).toBe('bounded-pixel-projection');
    expect(result.sourceIntervals[0].projectionDistancesPx).toEqual([3.2, 2.8]);
    expect(JSON.stringify(input)).toBe(before);
    expect(deriveSourceOpenings({ ...input, maxProjectionDistancePx: 3 }).windows).toHaveLength(0);
  });

  it('rejects ambiguous, excessive, oblique and beyond-host window projections', () => {
    const input = trace(); input.openings = [{ id: 'n', kind: 'window', endpoints: [{ x: 40, y: 3.2 }, { x: 180, y: 3.2 }], evidence: 'Glazing.' }];
    input.bareHouse.walls.push({ id: 'parallel', start: { x: 0, y: 6 }, end: { x: 400, y: 6 } });
    expect(deriveSourceOpenings(input).warnings[0].message).toContain('ambiguous');
    input.bareHouse.walls.pop();
    for (const endpoints of [
      [{ x: 40, y: 4.5 }, { x: 180, y: 4.5 }],
      [{ x: 40, y: -3.2 }, { x: 42, y: 3.2 }],
      [{ x: -2, y: 3.2 }, { x: 180, y: 3.2 }],
    ]) { input.openings[0].endpoints = endpoints; expect(deriveSourceOpenings(input).windows).toHaveLength(0); }
  });
  it('derives a supported opening from an accepted bare house', () => {
    const input = trace();
    const before = JSON.stringify(input);
    const result = deriveSourceOpenings(input);
    expect(result.doors).toEqual([{ id: 'd', wallId: 'w', position: .375, width: 400, type: 'double' }]);
    expect(result.reviewStatus).toBe('pass');
    expect(result.warnings).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps an aperture and warns when door operation is unresolved', () => {
    const input = trace();
    delete input.openings[0].doorType;
    delete input.openings[0].typeEvidence;
    const result = deriveSourceOpenings(input);
    expect(result.doors[0]).toEqual({ id: 'd', wallId: 'w', position: .375, width: 400 });
    expect(result.unresolvedDoorTypes).toEqual(['d']);
    expect(result.reviewStatus).toBe('warning');
    expect(result.warnings[0].message).toMatch(/operation is unresolved/);
  });

  it('round trips curved opening endpoints through the existing physical metric', () => {
    const input = trace();
    input.cmPerPixel = 1;
    input.bareHouse = bareHouse([{ id: 'w', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, curvePoint: { x: 0, y: 1000 } }]);
    input.openings[0].endpoints = [{ x: 14.4, y: 211.2 }, { x: 409.6, y: 460.8 }];
    const result = deriveSourceOpenings(input), door = result.doors[0];
    expect(door.position).not.toBeCloseTo((.12 + .64) / 2, 3);
    expect(door.width).toBeGreaterThan(Math.hypot(409.6 - 14.4, 460.8 - 211.2));
    const projected = planOpening({ ...input.bareHouse.walls[0], thickness: 20, height: 280, color: '#fff' }, door.position, door.width)!;
    expect(projected.curve!.start.x).toBeCloseTo(14.4, 8);
    expect(projected.curve!.end.y).toBeCloseTo(460.8, 8);
  });

  it('turns a split-host mistake into a review warning instead of failing the bare house', () => {
    const input = trace();
    input.bareHouse = bareHouse([
      { id: 'w-left', start: { x: 0, y: 0 }, end: { x: 45, y: 0 } },
      { id: 'w-right', start: { x: 55, y: 0 }, end: { x: 100, y: 0 } },
    ]);
    input.openings[0].wallId = 'w-left';
    input.openings[0].endpoints = [{ x: 40, y: 0 }, { x: 60, y: 0 }];
    const result = deriveSourceOpenings(input);
    expect(result.doors).toEqual([]);
    expect(result.reviewStatus).toBe('warning');
    expect(result.warnings[0].message).toMatch(/different normalized wall segments|too far/);
  });

  it('does not require complete solid/window/door surface partitions', () => {
    const input = trace();
    input.openings = [{ id: 'n', kind: 'window', wallId: 'w', endpoints: [{ x: 10, y: 0 }, { x: 60, y: 0 }], evidence: 'Visible glazing' }];
    const result = deriveSourceOpenings(input);
    expect(result.windows).toHaveLength(1);
    expect(result.reviewStatus).toBe('pass');
  });

  it('requires the accepted bare-house contract globally', () => {
    const input = trace();
    delete input.bareHouse.schemaVersion;
    expect(() => deriveSourceOpenings(input)).toThrow(/bare-house-v1/);
  });

  it('reports malformed individual opening evidence as warnings and continues', () => {
    const input = trace();
    input.openings[0].evidence = '';
    input.openings.push({ id: 'n', kind: 'window', wallId: 'w', endpoints: [{ x: 300, y: 0 }, { x: 350, y: 0 }], evidence: 'Visible glazing' });
    const result = deriveSourceOpenings(input);
    expect(result.doors).toEqual([]);
    expect(result.windows).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].id).toBe('d');
  });
});
