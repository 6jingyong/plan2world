import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeColumnEntity,
  RuntimeStairEntity,
  RuntimeVec2,
  RuntimeVec3,
  RuntimeWindowEntity,
} from './types';

const EPSILON = 1e-9;
const WINDOW_DEPTH = 0.025;
const STAIR_BASE_THICKNESS = 0.04;
const CYLINDER_SEGMENTS = 24;

export type StaticArchitectureKind = 'window' | 'column' | 'stair';
export type StaticArchitectureMaterial = 'glass' | 'column' | 'stair';

export interface StaticArchitecturePrimitive {
  id: string;
  kind: StaticArchitectureKind;
  ownerId: string;
  floorId: string;
  material: StaticArchitectureMaterial;
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

interface MeshBuilder {
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > EPSILON;
}

function normalize(value: RuntimeVec3): RuntimeVec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!(length > EPSILON)) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function faceNormal(points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3]): RuntimeVec3 {
  const a: RuntimeVec3 = [points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]];
  const b: RuntimeVec3 = [points[3][0] - points[0][0], points[3][1] - points[0][1], points[3][2] - points[0][2]];
  return normalize([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]);
}

function addQuad(
  builder: MeshBuilder,
  points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3],
  uvs: [RuntimeVec2, RuntimeVec2, RuntimeVec2, RuntimeVec2],
) {
  const normal = faceNormal(points);
  const base = builder.positions.length;
  builder.positions.push(...points);
  builder.normals.push(normal, normal, normal, normal);
  builder.uvs.push(...uvs);
  builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function rotateXZ(x: number, z: number, yaw: number): RuntimeVec2 {
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  return [x * cosine - z * sine, x * sine + z * cosine];
}

function worldPoint(center: RuntimeVec3, local: RuntimeVec3, yaw: number): RuntimeVec3 {
  const [x, z] = rotateXZ(local[0], local[2], yaw);
  return [center[0] + x, center[1] + local[1], center[2] + z];
}

function appendBox(builder: MeshBuilder, center: RuntimeVec3, size: RuntimeVec3, yaw: number) {
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const p = (x: number, y: number, z: number) => worldPoint(center, [x, y, z], yaw);
  addQuad(builder, [p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz)], [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]]);
  addQuad(builder, [p(hx, -hy, -hz), p(-hx, -hy, -hz), p(-hx, hy, -hz), p(hx, hy, -hz)], [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]]);
  addQuad(builder, [p(hx, -hy, hz), p(hx, -hy, -hz), p(hx, hy, -hz), p(hx, hy, hz)], [[0, 0], [size[2], 0], [size[2], size[1]], [0, size[1]]]);
  addQuad(builder, [p(-hx, -hy, -hz), p(-hx, -hy, hz), p(-hx, hy, hz), p(-hx, hy, -hz)], [[0, 0], [size[2], 0], [size[2], size[1]], [0, size[1]]]);
  addQuad(builder, [p(-hx, hy, hz), p(hx, hy, hz), p(hx, hy, -hz), p(-hx, hy, -hz)], [[0, 0], [size[0], 0], [size[0], size[2]], [0, size[2]]]);
  addQuad(builder, [p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, -hy, hz), p(-hx, -hy, hz)], [[0, 0], [size[0], 0], [size[0], size[2]], [0, size[2]]]);
}

function boxPrimitive(
  id: string,
  kind: StaticArchitectureKind,
  ownerId: string,
  floorId: string,
  center: RuntimeVec3,
  size: RuntimeVec3,
  yaw: number,
  material: StaticArchitectureMaterial,
): StaticArchitecturePrimitive {
  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  appendBox(builder, center, size, yaw);
  return { id, kind, ownerId, floorId, material, ...builder };
}

function compileWindow(entity: RuntimeWindowEntity): StaticArchitecturePrimitive | null {
  if (!finitePositive(entity.width) || !finitePositive(entity.height) || !entity.center.every(Number.isFinite)) return null;
  return boxPrimitive(
    `architecture:window:${entity.id}`, 'window', entity.id, entity.floorId,
    entity.center, [entity.width, entity.height, WINDOW_DEPTH], entity.yawClockwiseRadians, 'glass',
  );
}

function compileSquareColumn(entity: RuntimeColumnEntity): StaticArchitecturePrimitive | null {
  if (!finitePositive(entity.diameter) || !finitePositive(entity.height) || !entity.position.every(Number.isFinite)) return null;
  return boxPrimitive(
    `architecture:column:${entity.id}`, 'column', entity.id, entity.floorId,
    entity.position, [entity.diameter, entity.height, entity.diameter], entity.yawClockwiseRadians, 'column',
  );
}

function compileRoundColumn(entity: RuntimeColumnEntity): StaticArchitecturePrimitive | null {
  if (!finitePositive(entity.diameter) || !finitePositive(entity.height) || !entity.position.every(Number.isFinite)) return null;
  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const radius = entity.diameter / 2;
  const bottom = entity.position[1] - entity.height / 2;
  const top = entity.position[1] + entity.height / 2;
  for (let index = 0; index < CYLINDER_SEGMENTS; index += 1) {
    const a0 = index / CYLINDER_SEGMENTS * Math.PI * 2;
    const a1 = (index + 1) / CYLINDER_SEGMENTS * Math.PI * 2;
    const p0: RuntimeVec3 = [entity.position[0] + Math.cos(a0) * radius, bottom, entity.position[2] + Math.sin(a0) * radius];
    const p1: RuntimeVec3 = [entity.position[0] + Math.cos(a1) * radius, bottom, entity.position[2] + Math.sin(a1) * radius];
    const p2: RuntimeVec3 = [p1[0], top, p1[2]];
    const p3: RuntimeVec3 = [p0[0], top, p0[2]];
    addQuad(builder, [p1, p0, p3, p2], [[(index + 1) / CYLINDER_SEGMENTS, 0], [index / CYLINDER_SEGMENTS, 0], [index / CYLINDER_SEGMENTS, entity.height], [(index + 1) / CYLINDER_SEGMENTS, entity.height]]);

    const topBase = builder.positions.length;
    builder.positions.push([entity.position[0], top, entity.position[2]], p2, p3);
    builder.normals.push([0, 1, 0], [0, 1, 0], [0, 1, 0]);
    builder.uvs.push([0.5, 0.5], [1, 0], [0, 0]);
    builder.indices.push(topBase, topBase + 1, topBase + 2);

    const bottomBase = builder.positions.length;
    builder.positions.push([entity.position[0], bottom, entity.position[2]], p0, p1);
    builder.normals.push([0, -1, 0], [0, -1, 0], [0, -1, 0]);
    builder.uvs.push([0.5, 0.5], [0, 0], [1, 0]);
    builder.indices.push(bottomBase, bottomBase + 1, bottomBase + 2);
  }
  return {
    id: `architecture:column:${entity.id}`, kind: 'column', ownerId: entity.id, floorId: entity.floorId,
    material: 'column', ...builder,
  };
}

function compileColumn(entity: RuntimeColumnEntity): StaticArchitecturePrimitive | null {
  return entity.shape === 'round' ? compileRoundColumn(entity) : compileSquareColumn(entity);
}

function compileStraightStair(entity: RuntimeStairEntity): StaticArchitecturePrimitive | null {
  if (entity.traversal.kind !== 'ramp' || entity.stairType !== 'straight') return null;
  if (!finitePositive(entity.width) || !finitePositive(entity.depth) || !Number.isInteger(entity.riserCount) || entity.riserCount < 1) return null;
  const startY = entity.traversal.startElevation;
  const endY = entity.traversal.endElevation;
  if (!Number.isFinite(startY) || !Number.isFinite(endY) || Math.abs(endY - startY) <= EPSILON) return null;

  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const yaw = entity.yawClockwiseRadians;
  const depthAxis: RuntimeVec2 = [-Math.sin(yaw), Math.cos(yaw)];
  const travelSign = entity.direction === 'up' ? -1 : 1;
  const travel: RuntimeVec2 = [depthAxis[0] * travelSign, depthAxis[1] * travelSign];
  const renderYaw = travelSign < 0 ? yaw + Math.PI : yaw;
  const start: RuntimeVec2 = [
    entity.position[0] - travel[0] * entity.depth / 2,
    entity.position[2] - travel[1] * entity.depth / 2,
  ];
  const low = Math.min(startY, endY) - STAIR_BASE_THICKNESS;
  const delta = endY - startY;
  const stepDepth = entity.depth / entity.riserCount;

  for (let index = 0; index < entity.riserCount; index += 1) {
    const topProgress = delta > 0 ? (index + 1) / entity.riserCount : index / entity.riserCount;
    const top = startY + delta * topProgress;
    const height = Math.max(STAIR_BASE_THICKNESS, top - low);
    const distance = (index + 0.5) * stepDepth;
    const center: RuntimeVec3 = [
      start[0] + travel[0] * distance,
      low + height / 2,
      start[1] + travel[1] * distance,
    ];
    appendBox(builder, center, [entity.width, height, stepDepth], renderYaw);
  }

  return {
    id: `architecture:stair:${entity.id}`, kind: 'stair', ownerId: entity.id, floorId: entity.floorId,
    material: 'stair', ...builder,
  };
}

/** Static runtime entities that belong in shared presentation geometry rather
 * than engine-specific compatibility proxies. Dynamic doors and replaceable
 * furniture stay outside architecture.glb.
 */
export function compileStaticArchitectureEntities(scene: Plan2WorldRuntimeSceneV1): StaticArchitecturePrimitive[] {
  const primitives: StaticArchitecturePrimitive[] = [];
  for (const entity of scene.entities) {
    let primitive: StaticArchitecturePrimitive | null = null;
    if (entity.kind === 'window') primitive = compileWindow(entity);
    else if (entity.kind === 'column') primitive = compileColumn(entity);
    else if (entity.kind === 'stair') primitive = compileStraightStair(entity);
    if (primitive) primitives.push(primitive);
  }
  return primitives;
}
