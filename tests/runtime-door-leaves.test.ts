import { describe, expect, it } from 'vitest';
import type { Door } from '$lib/models/types';
import { compileRuntimeDoor } from '$lib/runtime/doorCompilation';
import { compileRuntimeWallPathProfile } from '$lib/runtime/wallPathGeometry';
import { drawDoorOnWall } from '$lib/utils/canvasRenderer';
import type { RuntimeWallEntity } from '$lib/runtime/types';

const native: Door = { id: 'entry/door', wallId: 'wall', position: 0.4, width: 160, height: 220, type: 'double', swingDirection: 'left', flipSide: false };
function host(yaw: number): RuntimeWallEntity {
  return { id: 'wall', floorId: 'ground', kind: 'wall', path: { start: [1, 2], end: [1 + 8 * Math.cos(yaw), 2 + 8 * Math.sin(yaw)] }, thickness: 0.2, startHeight: 3, endHeight: 3, boundaryType: 'solid', visible: true };
}

describe('compiler-owned door leaves', () => {
  it('matches the actual native 2D paired-door leaf endpoints for both direction and side controls', () => {
    for (const yaw of [0, 0.7, Math.PI]) for (const type of ['double', 'french'] as const)
      for (const swingDirection of ['left', 'right'] as const) for (const flipSide of [false, true]) {
        const wall = host(yaw), door = { ...native, type, swingDirection, flipSide };
        const lines: number[][][] = [];
        let path: number[][] = [];
        const context = {
          lineWidth: 1,
          beginPath() { path = []; },
          moveTo(x: number, y: number) { path.push([x, y]); },
          lineTo(x: number, y: number) { path.push([x, y]); },
          stroke() { if (context.lineWidth === 2.5) lines.push(path); },
        };
        const ctx = new Proxy(context, { get: (target, key) => target[key as keyof typeof target] ?? (() => {}) }) as unknown as CanvasRenderingContext2D;
        drawDoorOnWall({ ctx, width: 0, height: 0, camX: 0, camY: 0, zoom: 0.01 }, {
          id: wall.id, start: { x: wall.path.start[0] * 100, y: wall.path.start[1] * 100 },
          end: { x: wall.path.end[0] * 100, y: wall.path.end[1] * 100 }, thickness: 20, height: 300, color: '#ccc',
        }, door);
        const { entity } = compileRuntimeDoor('ground', 0, door, wall);
        if (entity.interaction.kind !== 'swing') throw new Error('Expected swing');
        expect(lines).toHaveLength(2);
        for (const [index, leaf] of entity.interaction.leaves.entries()) {
          const [x, , z] = leaf.pivot, angle = leaf.openAngleRadians;
          const dx = entity.closedPose.center[0] - x, dz = entity.closedPose.center[2] - z;
          const expected = [[x, z], [x + Math.cos(angle) * dx + Math.sin(angle) * dz, z - Math.sin(angle) * dx + Math.cos(angle) * dz]];
          lines[index].forEach((point, j) => point.forEach((value, axis) => expect(value).toBeCloseTo(expected[j][axis], 10)));
        }
      }
  });

  it.each(['double', 'french'] as const)('emits two equal %s leaves with explicit opposing jamb pivots at every orientation and opening side', type => {
    for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const flipSide of [false, true]) for (const swingDirection of ['left', 'right'] as const) {
      const wall = host(yaw), door = { ...native, type, flipSide, swingDirection };
      const before = structuredClone({ wall, door });
      const { entity, colliders } = compileRuntimeDoor('ground', 0.4, door, wall);
      expect({ wall, door }).toEqual(before);
      expect(compileRuntimeDoor('ground', 0.4, door, wall)).toEqual({ entity, colliders });
      if (entity.interaction.kind !== 'swing') throw new Error('Expected swing');
      const leaves = entity.interaction.leaves;
      expect(leaves.map(l => l.id)).toEqual(['door:entry%2Fdoor:leaf:0', 'door:entry%2Fdoor:leaf:1']);
      expect(leaves).toHaveLength(2);
      for (const [index, leaf] of leaves.entries()) {
        const sign = index === 0 ? -1 : 1;
        expect(leaf.size).toEqual([expect.closeTo(0.8, 12), 2.2, 0.04]);
        expect(leaf.pivot).toEqual([expect.closeTo(entity.closedPose.center[0] + sign * 0.8 * Math.cos(yaw), 12), 0.4, expect.closeTo(entity.closedPose.center[2] + sign * 0.8 * Math.sin(yaw), 12)]);
        expect(leaf.closedPose.center).toEqual([expect.closeTo(entity.closedPose.center[0] + sign * 0.4 * Math.cos(yaw), 12), 1.5, expect.closeTo(entity.closedPose.center[2] + sign * 0.4 * Math.sin(yaw), 12)]);
        expect(leaf.axis).toEqual([0, 1, 0]);
        expect(leaf.openAngleRadians).toBe(sign * (swingDirection === 'left' ? 1 : -1) * (flipSide ? -1 : 1) * Math.PI / 2);
        expect(colliders[index]).toEqual({ id: leaf.colliderId, ownerId: native.id, floorId: 'ground', dynamic: true, kind: 'box', center: leaf.closedPose.center, size: leaf.size, yawClockwiseRadians: leaf.closedPose.yawClockwiseRadians });
      }
      // Two jamb-hinged leaves meet at the doorway center, without a third
      // full-width blocker. Native side changes affect motion, never part IDs.
      expect(colliders).toHaveLength(2);

    }
  });

  it('fits curved-host leaves and pivots to the physical opening chord', () => {
    const wall = host(0); wall.path.control = [4, 6];
    const path = compileRuntimeWallPathProfile(wall), distance = path.distanceAt(native.position);
    const a = path.sampleDistance(distance - 0.8).point, b = path.sampleDistance(distance + 0.8).point;
    const { entity } = compileRuntimeDoor('ground', 2, native, wall);
    if (entity.interaction.kind !== 'swing') throw new Error('Expected swing');
    const [left, right] = entity.interaction.leaves;
    expect(left.pivot).toEqual([expect.closeTo(a[0], 12), 2, expect.closeTo(a[1], 12)]);
    expect(right.pivot).toEqual([expect.closeTo(b[0], 12), 2, expect.closeTo(b[1], 12)]);
    expect(left.size[0] + right.size[0]).toBeCloseTo(Math.hypot(b[0] - a[0], b[1] - a[1]), 12);
    expect(entity.width).toBe(1.6); // wall aperture remains physical arc width
    expect(left.size[0] * 2).toBeLessThan(entity.width);
    expect(entity.closedPose.yawClockwiseRadians).toBeCloseTo(Math.atan2(b[1] - a[1], b[0] - a[0]), 12);
  });

  it.each(['single', 'sliding', 'pocket', 'bifold', 'garage', 'opening'] as const)('keeps %s on its discriminated mechanism without inferred hinges', type => {
    const { entity, colliders } = compileRuntimeDoor('ground', 0, { ...native, type }, host(0.7));
    if (entity.interaction.kind === 'none') { expect(colliders).toEqual([]); return; }
    expect(entity.interaction.leaves).toHaveLength(1);
    if (entity.interaction.kind !== 'swing') expect(entity.interaction.leaves[0]).not.toHaveProperty('pivot');
    if (entity.interaction.kind === 'unsupported') {
      expect(entity.interaction.sourceMotion).toBe(type === 'bifold' ? 'fold' : 'overhead');
      expect(entity.interaction.leaves[0]).not.toHaveProperty('axis');
    }
  });
});
