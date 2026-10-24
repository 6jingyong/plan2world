import { describe, expect, it, vi } from 'vitest';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { readProject } from '$lib/utils/projectValidation';

function project() {
  return readProject({
    id: 'floor-acceptance', name: 'Floor acceptance', activeFloorId: 'ground',
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    floors: [{
      id: 'ground', name: 'Ground', level: 0,
      walls: [
        { id: 'north', start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, thickness: 20, height: 280 },
        { id: 'east', start: { x: 600, y: 0 }, end: { x: 600, y: 600 }, thickness: 20, height: 280 },
        { id: 'south', start: { x: 600, y: 600 }, end: { x: 0, y: 600 }, thickness: 20, height: 280 },
        { id: 'west', start: { x: 0, y: 600 }, end: { x: 0, y: 0 }, thickness: 20, height: 280 },
      ],
      rooms: [], doors: [], windows: [], furniture: [], columns: [], stairs: [],
    }],
  });
}

function boundary(points: number[][]) {
  return points.map(([x, y]) => ({ point: { x, y } }));
}

function ground(id: string, points: number[][], floorOpening = false) {
  return { id, name: id, walls: [], floorTexture: 'concrete', area: 0, floorOpening, boundary: boundary(points) };
}

describe('runtime floor acceptance', () => {
  it.each([false, true])('blocks a crossing native boundary, including floorOpening=%s, without changing it', floorOpening => {
    const source = project();
    source.floors[0].rooms.push(ground('crossing', [[100, 100], [400, 400], [100, 400], [400, 100]], floorOpening));
    const before = structuredClone(source);
    // Native editing keeps invalid boundaries recoverable, with no usable ring.
    expect(analyzeFloor(source.floors[0]).polygons.get('crossing')).toEqual([]);
    expect(() => compileRuntimeScene(source)).toThrow(/floor "ground".*room "crossing".*native boundary/i);
    expect(source).toEqual(before);
  });

  it.each([false, true])('blocks a deleted native boundary reference, including floorOpening=%s', floorOpening => {
    const source = project();
    const area = ground('missing-wall', [[100, 100], [400, 100], [400, 400]], floorOpening);
    source.floors[0].rooms.push({ ...area, boundary: [{ wallId: 'deleted' }, ...area.boundary] });
    expect(() => compileRuntimeScene(source)).toThrow(/floor "ground".*room "missing-wall".*native boundary/i);
  });

  it('blocks a native surface that cannot produce collision after centimetre conversion', () => {
    const source = project();
    // Positive native area, below the existing runtime triangulator's precision.
    // The other valid room must not hide this missing surface.
    source.floors[0].rooms.push(ground('tiny', [[700, 0], [700.003, 0], [700.003, 0.003], [700, 0.003]]));
    expect(analyzeFloor(source.floors[0]).polygons.get('tiny')).toHaveLength(4);
    expect(() => compileRuntimeScene(source)).toThrow(/floor "ground".*room "tiny".*triangulat/i);
  });

  it('rejects invalid geometry at the shared artifact boundary before resolving assets', async () => {
    const source = project(), readAsset = vi.fn(async () => null);
    source.floors[0].rooms.push(ground('crossing', [[100, 100], [400, 400], [100, 400], [400, 100]]));
    await expect(compileRuntimeArtifacts(source, readAsset)).rejects.toThrow(/room "crossing"/);
    expect(readAsset).not.toHaveBeenCalled();
  });

  it('retains a valid concave surface and authored floor opening with one collider per emitted room', () => {
    const source = project();
    source.floors[0].walls = [];
    source.floors[0].rooms.push(
      ground('concave', [[0, 0], [600, 0], [600, 300], [300, 300], [300, 600], [0, 600]]),
      ground('opening', [[100, 100], [200, 100], [200, 200], [100, 200]], true),
    );
    const before = structuredClone(source), scene = compileRuntimeScene(source);
    const room = scene.floors[0].rooms[0];
    expect(scene.floors[0].rooms.map(room => room.id)).toEqual(['concave']);
    expect(room.holes).toEqual([[[1, 1], [2, 1], [2, 2], [1, 2]]]);
    const colliders = scene.colliders.filter(c => c.ownerId === room.id && c.kind === 'triangle-mesh');
    expect(colliders).toHaveLength(1);
    const collider = colliders[0];
    if (collider.kind !== 'triangle-mesh') throw new Error('Missing floor collision');
    let area = 0;
    for (let i = 0; i < collider.indices.length; i += 3) {
      const [a, b, c] = collider.indices.slice(i, i + 3).map(index => collider.vertices[index]);
      const upwardArea = ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])) / 2;
      expect(upwardArea).toBeGreaterThan(0);
      area += upwardArea;
      const x = (a[0] + b[0] + c[0]) / 3, z = (a[2] + b[2] + c[2]) / 3;
      expect(x > 1 && x < 2 && z > 1 && z < 2).toBe(false);
    }
    expect(area).toBeCloseTo(26, 10);
    expect(compileRuntimeScene(source)).toEqual(scene);
    expect(source).toEqual(before);
  });

  it('preserves supported native face walks around an inner loop attached by one bridge', () => {
    const source = project();
    const segment = (id: string, a: number[], b: number[]) => ({
      id, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 20, height: 280, color: '#fff',
    });
    source.floors[0].walls.push(
      segment('inner-n', [200, 200], [300, 200]), segment('inner-e', [300, 200], [300, 300]),
      segment('inner-s', [300, 300], [200, 300]), segment('inner-w', [200, 300], [200, 200]),
      segment('bridge', [600, 200], [300, 200]),
    );
    const scene = compileRuntimeScene(source);
    expect(scene.floors[0].rooms).toHaveLength(2);
    expect(scene.floors[0].rooms.some(room => room.polygon.length > 4)).toBe(true);
    let area = 0;
    for (const room of scene.floors[0].rooms) {
      const collider = scene.colliders.find(c => c.id === `floor:${room.id}`);
      if (collider?.kind !== 'triangle-mesh') throw new Error('Missing room floor');
      for (let i = 0; i < collider.indices.length; i += 3) {
        const [a, b, c] = collider.indices.slice(i, i + 3).map(index => collider.vertices[index]);
        area += ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])) / 2;
      }
    }
    expect(area).toBeCloseTo(36, 10);
  });
});
