import { describe, expect, it } from 'vitest';
import { BARE_HOUSE_VERSION, SOURCE_WALL_TRACE_VERSION, buildBareHouse } from '$lib/plan2world/bareHouse';

function trace(): any {
  return {
    schemaVersion: SOURCE_WALL_TRACE_VERSION,
    walls: [
      { start: { x: 0, y: 40 }, end: { x: 100, y: 40 } },
      { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
      { start: { x: 0, y: 100 }, end: { x: 0, y: 40 } },
    ],
  };
}

describe('bare-house reconstruction contract', () => {
  it('assigns IDs and normalizes evidence-only source walls deterministically', () => {
    const input = trace(), before = JSON.stringify(input), result = buildBareHouse(input);
    expect(result.schemaVersion).toBe(BARE_HOUSE_VERSION);
    expect(result.sourceSchemaVersion).toBe(SOURCE_WALL_TRACE_VERSION);
    expect(result.sourceWallMap.w2).toEqual(['w2~1', 'w2~2']);
    expect(result.walls.some(wall => wall.id === 'w1')).toBe(true);
    expect(result.enclosures).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects model-authored wall IDs and topology controls', () => {
    const withId = trace();
    withId.walls[0].id = 'model-wall';
    expect(() => buildBareHouse(withId)).toThrow(/unsupported fields: id/);

    const withTolerance = trace();
    withTolerance.maxJunctionDistancePx = 12;
    expect(() => buildBareHouse(withTolerance)).toThrow(/unsupported fields: maxJunctionDistancePx/);
  });

  it('rejects unversioned wall evidence instead of creating another implicit format', () => {
    const input = trace(); delete input.schemaVersion;
    expect(() => buildBareHouse(input)).toThrow(/source-wall-trace-v1/);
  });

  it('rejects overlapping shared-boundary evidence before annotation instead of deleting generated walls', () => {
    const input = { schemaVersion: SOURCE_WALL_TRACE_VERSION, walls: [
      { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { start: { x: 150, y: 0 }, end: { x: 80, y: 0 } },
    ] };
    const before = JSON.stringify(input);
    expect(() => buildBareHouse(input)).toThrow(/Overlapping normalized wall geometry/);
    expect(JSON.stringify(input)).toBe(before);
  });
});
