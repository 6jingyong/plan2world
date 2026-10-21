import { describe, expect, it } from 'vitest';
import type { Wall } from '$lib/models/types';
import { detectRooms, getRoomPolygon, resolveRoomGeometry } from '$lib/utils/roomDetection';
import { pointInPolygon } from '$lib/utils/hitTesting';

const wall = (id: string, a: number[], b: number[]): Wall => ({ id, start: { x: a[0], y: a[1] },
  end: { x: b[0], y: b[1] }, thickness: 12, height: 280, color: '#eee' });
const rectangle = (prefix: string, x: number, y: number, width: number, height: number) => [
  wall(`${prefix}n`, [x, y], [x + width, y]), wall(`${prefix}e`, [x + width, y], [x + width, y + height]),
  wall(`${prefix}s`, [x + width, y + height], [x, y + height]), wall(`${prefix}w`, [x, y + height], [x, y]),
];

describe('native face polygons use the traced cycle', () => {
  it('retains the full outer boundary around an inner loop attached by one bridge', () => {
    const walls = [...rectangle('outer', 0, 0, 1000, 1000), ...rectangle('inner', 400, 500, 200, 200),
      wall('bridge', [1000, 500], [600, 500])];
    const before = JSON.stringify(walls), geometry = resolveRoomGeometry({ walls, rooms: [] });
    expect(geometry).toHaveLength(2);
    const outer = geometry.find(g => g.room.area > 50)!;
    expect(outer.room.area).toBe(96);
    for (const p of [{ x: 950, y: 50 }, { x: 50, y: 50 }, { x: 950, y: 950 }, { x: 50, y: 950 }])
      expect(pointInPolygon(p, outer.polygon)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 600 }, outer.polygon)).toBe(false);
    expect(getRoomPolygon(outer.room, walls)).toEqual(outer.polygon);
    expect(JSON.stringify(walls)).toBe(before);
  });

  it('allows a closed face walk to traverse each directed edge of a long dangling tree', () => {
    const walls = rectangle('outer', 0, 0, 1000, 1000);
    for (let i = 0; i < 30; i++) walls.push(wall(`spur-${i}`, [500, i * 20], [500, (i + 1) * 20]));
    const rooms = detectRooms(walls); expect(rooms).toHaveLength(1); expect(rooms[0].area).toBe(100);
    const poly = getRoomPolygon(rooms[0], walls); expect(poly.every(p => p.x === 0 || p.x === 1000 || p.y === 0 || p.y === 1000)).toBe(true);
    expect(pointInPolygon({ x: 900, y: 50 }, poly)).toBe(true);
  });

  it('returns no polygon for an open wall chain instead of inventing a diagonal closing edge', () => {
    const walls = rectangle('outer', 0, 0, 1000, 1000).slice(0, 3);
    expect(getRoomPolygon({ id: 'manual', name: 'Open', walls: walls.map(w => w.id), area: 0, floorTexture: 'hardwood' }, walls)).toEqual([]);
  });
});
