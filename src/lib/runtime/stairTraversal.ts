import type { Floor, Stair } from '$lib/models/types';
import type { RuntimeStairEntity, RuntimeTriangleMeshCollider, RuntimeVec3 } from './types';

const METRES_PER_CM = 0.01;
const EPSILON = 1e-9;
const m = (cm: number) => cm * METRES_PER_CM;

export interface RuntimeStairTarget {
  floorId: string;
  elevationCm: number;
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function upwardWinding(vertices: RuntimeVec3[]): number[] {
  const [a, b, c] = vertices;
  const abX = b[0] - a[0], abZ = b[2] - a[2];
  const acX = c[0] - a[0], acZ = c[2] - a[2];
  const normalY = abZ * acX - abX * acZ;
  return normalY >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
}

/** Compile one native straight stair into explicit runtime semantics plus a
 * walkable ramp surface. The native UP/DN arrow chooses the adjacent floor and
 * which footprint end is the target; Godot never has to reinterpret that UI
 * convention or derive vertical geometry from a presentation mesh.
 */
export function compileRuntimeStair(
  floor: Floor,
  elevationCm: number,
  stair: Stair,
  target: RuntimeStairTarget | null,
): { entity: RuntimeStairEntity; collider?: RuntimeTriangleMeshCollider } {
  const yaw = stair.rotation * Math.PI / 180;
  const base = {
    id: stair.id,
    floorId: floor.id,
    kind: 'stair' as const,
    position: [m(stair.position.x), m(elevationCm), m(stair.position.y)] as RuntimeVec3,
    yawClockwiseRadians: yaw,
    width: m(stair.width),
    depth: m(stair.depth),
    riserCount: stair.riserCount,
    direction: stair.direction,
    stairType: stair.stairType,
  };

  if (!finitePositive(stair.width) || !finitePositive(stair.depth) || !Number.isInteger(stair.riserCount) || stair.riserCount < 1) {
    return { entity: { ...base, traversal: { kind: 'unsupported', reason: 'invalid-geometry' } } };
  }
  if (stair.stairType !== 'straight') {
    return { entity: { ...base, traversal: { kind: 'unsupported', reason: 'non-straight' } } };
  }
  if (!target) {
    return { entity: { ...base, traversal: { kind: 'unsupported', reason: 'missing-target-floor' } } };
  }

  const verticalDeltaCm = target.elevationCm - elevationCm;
  if (!Number.isFinite(target.elevationCm) ||
      (stair.direction === 'up' && verticalDeltaCm <= EPSILON) ||
      (stair.direction === 'down' && verticalDeltaCm >= -EPSILON)) {
    return { entity: { ...base, traversal: { kind: 'unsupported', reason: 'invalid-target-elevation' } } };
  }

  // Native plan rotation is clockwise. Local +depth maps to this plan vector;
  // the 2D UP arrow points toward -depth while DN points toward +depth.
  const depthAxis = [-Math.sin(yaw), Math.cos(yaw)];
  const travelSign = stair.direction === 'up' ? -1 : 1;
  const travel = [depthAxis[0] * travelSign, depthAxis[1] * travelSign];
  const widthAxis = [Math.cos(yaw), Math.sin(yaw)];
  const halfDepth = stair.depth / 2;
  const halfWidth = stair.width / 2;
  const start = {
    x: stair.position.x - travel[0] * halfDepth,
    y: stair.position.y - travel[1] * halfDepth,
  };
  const end = {
    x: stair.position.x + travel[0] * halfDepth,
    y: stair.position.y + travel[1] * halfDepth,
  };
  const startY = m(elevationCm);
  const endY = m(target.elevationCm);
  const vertices: RuntimeVec3[] = [
    [m(start.x - widthAxis[0] * halfWidth), startY, m(start.y - widthAxis[1] * halfWidth)],
    [m(start.x + widthAxis[0] * halfWidth), startY, m(start.y + widthAxis[1] * halfWidth)],
    [m(end.x + widthAxis[0] * halfWidth), endY, m(end.y + widthAxis[1] * halfWidth)],
    [m(end.x - widthAxis[0] * halfWidth), endY, m(end.y - widthAxis[1] * halfWidth)],
  ];

  return {
    entity: {
      ...base,
      traversal: {
        kind: 'ramp',
        targetFloorId: target.floorId,
        startElevation: startY,
        endElevation: endY,
      },
    },
    collider: {
      id: `stair:${stair.id}:ramp`,
      ownerId: stair.id,
      floorId: floor.id,
      dynamic: false,
      kind: 'triangle-mesh',
      vertices,
      indices: upwardWinding(vertices),
    },
  };
}
