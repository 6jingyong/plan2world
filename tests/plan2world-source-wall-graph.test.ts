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

describe('source wall graph normalization', () => {
  it('splits a long wall at a real T-junction so the room closes without inventing a wall', () => {
    const input = tRoom();
    const before = JSON.stringify(input);
    const result = normalizeSourceWallGraph(input);
    expect(result.sourceWallMap.right).toEqual(['right~1', 'right~2']);
    expect(result.virtualSplitCount).toBeGreaterThanOrEqual(1);
    expect(result.enclosures[0].boundary.map((item: any) => item.wallId)).toEqual(['top', 'right~2', 'bottom', 'left']);
    const rightRoomSide = result.walls.find((wall: any) => wall.id === 'right~2');
    expect(rightRoomSide.start).toEqual({ x: 100, y: 40 });
    expect(rightRoomSide.end).toEqual({ x: 100, y: 100 });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('snaps a small traced endpoint residual onto an existing host junction', () => {
    const input = tRoom();
    input.walls[0].end = { x: 98.5, y: 40 };
    const result = normalizeSourceWallGraph(input);
    const top = result.walls.find((wall: any) => wall.id === 'top');
    expect(top.end.x).toBeCloseTo(100, 8);
    expect(top.end.y).toBeCloseTo(40, 8);
    expect(result.snappedEndpointCount).toBeGreaterThan(0);
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
});
