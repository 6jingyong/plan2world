import { describe, expect, it } from 'vitest';
import { normalizeSourceWallGraph } from '$lib/plan2world/sourceWallGraph';

function tRoom(): any {
  return {
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

function wallById(result: ReturnType<typeof normalizeSourceWallGraph>, id: string) {
  const wall = result.walls.find(item => item.id === id);
  if (!wall) throw new Error(`expected normalized wall ${id}`);
  return wall;
}

describe('source wall graph normalization', () => {
  it('splits a long wall at a real T-junction so the room closes without inventing a wall', () => {
    const input = tRoom();
    const before = JSON.stringify(input);
    const result = normalizeSourceWallGraph(input);
    expect(result.sourceWallMap.right).toEqual(['right~1', 'right~2']);
    expect(result.virtualSplitCount).toBeGreaterThanOrEqual(1);
    expect(result.enclosures[0].boundary.map((item: any) => item.wallId)).toEqual(['top', 'right~2', 'bottom', 'left']);
    const rightRoomSide = wallById(result, 'right~2');
    expect(rightRoomSide.start).toEqual({ x: 100, y: 40 });
    expect(rightRoomSide.end).toEqual({ x: 100, y: 100 });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('snaps a small traced endpoint residual onto an existing host junction', () => {
    const input = tRoom();
    input.walls[0].end = { x: 98.5, y: 40 };
    const result = normalizeSourceWallGraph(input);
    const top = wallById(result, 'top');
    expect(top.end.x).toBeCloseTo(100, 8);
    expect(top.end.y).toBeCloseTo(40, 8);
    expect(result.snappedEndpointCount).toBeGreaterThan(0);
  });

  it('bridges an explicitly observed door gap without model-authored wall IDs', () => {
    const result = normalizeSourceWallGraph({
      walls: [
        { id: 'left-run', start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
        { id: 'right-run', start: { x: 60, y: 0 }, end: { x: 100, y: 0 } },
      ],
      doorGaps: [{ id: 'door-gap', from: { x: 40, y: 0 }, to: { x: 60, y: 0 } }],
    });
    expect(wallById(result, 'door-gap')).toMatchObject({ start: { x: 40, y: 0 }, end: { x: 60, y: 0 } });
  });

  it('rejects model-authored door-gap host IDs', () => {
    expect(() => normalizeSourceWallGraph({
      walls: [
        { id: 'a', start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
        { id: 'b', start: { x: 60, y: 0 }, end: { x: 100, y: 0 } },
      ],
      doorGaps: [{ id: 'gap', fromWallId: 'a', toWallId: 'b', from: { x: 40, y: 0 }, to: { x: 60, y: 0 } }],
    })).toThrow(/host IDs are program-owned/);
  });

  it('refuses to bridge a genuine unsupported gap', () => {
    const input = tRoom();
    input.walls[1].start.x = 110;
    input.walls[1].end.x = 110;
    expect(() => normalizeSourceWallGraph(input)).toThrow(/wall topology is open/);
  });

  it('splits crossing straight wall centrelines deterministically', () => {
    const result = normalizeSourceWallGraph({
      walls: [
        { id: 'h', start: { x: 0, y: 50 }, end: { x: 100, y: 50 } },
        { id: 'v', start: { x: 50, y: 0 }, end: { x: 50, y: 100 } },
      ],
    });
    expect(result.sourceWallMap.h).toEqual(['h~1', 'h~2']);
    expect(result.sourceWallMap.v).toEqual(['v~1', 'v~2']);
    expect(result.virtualSplitCount).toBe(2);
  });

  it('uses one bounded junction for several traced endpoints within the snap tolerance', () => {
    const walls = [
      { id: 'left', start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
      { id: 'right', start: { x: 52, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'up', start: { x: 50, y: -100 }, end: { x: 50, y: 0 } },
      { id: 'down', start: { x: 52, y: 0 }, end: { x: 52, y: 100 } },
    ];
    const before = JSON.stringify(walls);
    const normalize = (input: typeof walls) => normalizeSourceWallGraph({ walls: input }).walls
      .sort((a, b) => a.id.localeCompare(b.id));
    const result = normalize(walls);
    const endpoints = result.map(wall => wall.id === 'left' || wall.id === 'up' ? wall.end : wall.start);
    expect(new Set(endpoints.map(point => JSON.stringify(point))).size).toBe(1);
    expect(normalize([...walls].reverse())).toEqual(result);
    for (const wall of result) {
      const source = walls.find(item => item.id === wall.id)!;
      for (const endpoint of ['start', 'end'] as const) {
        expect(Math.hypot(wall[endpoint].x - source[endpoint].x, wall[endpoint].y - source[endpoint].y)).toBeLessThanOrEqual(3);
      }
    }
    expect(JSON.stringify(walls)).toBe(before);
  });

  it('does not chain nearby junctions across an unsupported gap or collapse a short source wall', () => {
    const result = normalizeSourceWallGraph({ walls: [
      { id: 'left', start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
      { id: 'short', start: { x: 52, y: 0 }, end: { x: 54, y: 0 } },
      { id: 'right', start: { x: 56, y: 0 }, end: { x: 100, y: 0 } },
    ] });
    const left = wallById(result, 'left'), right = wallById(result, 'right'), short = wallById(result, 'short');
    expect(Math.hypot(short.end.x - short.start.x, short.end.y - short.start.y)).toBeGreaterThan(0);
    expect(left.end).not.toEqual(right.start);
    expect(left.end.x).toBeLessThanOrEqual(53);
    expect(right.start.x).toBeGreaterThanOrEqual(53);
  });
});
