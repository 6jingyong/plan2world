import type { RuntimeVec2, RuntimeVec3 } from './types';
const EPSILON = 1e-9;
export interface MeshBuilder {
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
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

export function addQuad(
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

export function appendBox(builder: MeshBuilder, center: RuntimeVec3, size: RuntimeVec3, yaw: number) {
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const p = (x: number, y: number, z: number) => worldPoint(center, [x, y, z], yaw);
  addQuad(builder, [p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, hy, hz), p(-hx, hy, hz)], [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]]);
  addQuad(builder, [p(hx, -hy, -hz), p(-hx, -hy, -hz), p(-hx, hy, -hz), p(hx, hy, -hz)], [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]]);
  addQuad(builder, [p(hx, -hy, hz), p(hx, -hy, -hz), p(hx, hy, -hz), p(hx, hy, hz)], [[0, 0], [size[2], 0], [size[2], size[1]], [0, size[1]]]);
  addQuad(builder, [p(-hx, -hy, -hz), p(-hx, -hy, hz), p(-hx, hy, hz), p(-hx, hy, -hz)], [[0, 0], [size[2], 0], [size[2], size[1]], [0, size[1]]]);
  addQuad(builder, [p(-hx, hy, hz), p(hx, hy, hz), p(hx, hy, -hz), p(-hx, hy, -hz)], [[0, 0], [size[0], 0], [size[0], size[2]], [0, size[2]]]);
  addQuad(builder, [p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, -hy, hz), p(-hx, -hy, hz)], [[0, 0], [size[0], 0], [size[0], size[2]], [0, size[2]]]);
}

