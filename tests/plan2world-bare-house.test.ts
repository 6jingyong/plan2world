import { describe, expect, it } from 'vitest';
import { BARE_HOUSE_VERSION, SOURCE_WALL_TRACE_VERSION, buildBareHouse } from '$lib/plan2world/bareHouse';

function trace(): any {
  return {
    schemaVersion: SOURCE_WALL_TRACE_VERSION,
    maxJunctionDistancePx: 3,
    walls: [
      { id: 'top', start: { x: 0, y: 40 }, end: { x: 100, y: 40 } },
      { id: 'right', start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { id: 'bottom', start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
      { id: 'left', start: { x: 0, y: 100 }, end: { x: 0, y: 40 } },
    ],
    enclosures: [{ id: 'room', boundary: [{ wallId: 'top' }, { wallId: 'right' }, { wallId: 'bottom' }, { wallId: 'left' }] }],
  };
}

describe('bare-house reconstruction contract', () => {
  it('turns a versioned source wall trace into one normalized geometry artifact', () => {
    const input = trace();
    const before = JSON.stringify(input);
    const result = buildBareHouse(input);
    expect(result.schemaVersion).toBe(BARE_HOUSE_VERSION);
    expect(result.sourceSchemaVersion).toBe(SOURCE_WALL_TRACE_VERSION);
    expect(result.sourceWallMap.right).toEqual(['right~1', 'right~2']);
    expect(result.enclosures[0].boundary.map(item => item.wallId)).toEqual(['top', 'right~2', 'bottom', 'left']);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects unversioned wall evidence instead of creating another implicit format', () => {
    const input = trace();
    delete input.schemaVersion;
    expect(() => buildBareHouse(input)).toThrow(/source-wall-trace-v1/);
  });
});
