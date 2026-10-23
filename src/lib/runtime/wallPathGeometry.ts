import type { RuntimeVec2, RuntimeWallEntity } from './types';

const EPSILON = 1e-9;
const MAX_CURVE_SEGMENT_LENGTH = 0.25;
const MAX_CURVE_DEVIATION = 0.0025;
const MAX_SUBDIVISION_DEPTH = 12;

export interface RuntimeWallPathNode {
  position: number;
  distance: number;
  point: RuntimeVec2;
  tangent: RuntimeVec2;
  normal: RuntimeVec2;
  height: number;
}

export interface RuntimeWallPathSample extends RuntimeWallPathNode {}

export interface RuntimeWallPathProfile {
  length: number;
  nodes: RuntimeWallPathNode[];
  sampleDistance(distance: number): RuntimeWallPathSample;
  distanceAt(position: number): number;
  positionAt(distance: number): number;
}

type RuntimeWallPath = RuntimeWallEntity['path'];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pointAt(path: RuntimeWallPath, position: number): RuntimeVec2 {
  const t = clamp01(position);
  if (!path.control) {
    return [
      path.start[0] + (path.end[0] - path.start[0]) * t,
      path.start[1] + (path.end[1] - path.start[1]) * t,
    ];
  }
  const mt = 1 - t;
  return [
    mt * mt * path.start[0] + 2 * mt * t * path.control[0] + t * t * path.end[0],
    mt * mt * path.start[1] + 2 * mt * t * path.control[1] + t * t * path.end[1],
  ];
}

function tangentAt(path: RuntimeWallPath, position: number): RuntimeVec2 {
  const t = clamp01(position);
  let dx: number;
  let dz: number;
  if (path.control) {
    const mt = 1 - t;
    dx = 2 * mt * (path.control[0] - path.start[0]) + 2 * t * (path.end[0] - path.control[0]);
    dz = 2 * mt * (path.control[1] - path.start[1]) + 2 * t * (path.end[1] - path.control[1]);
  } else {
    dx = path.end[0] - path.start[0];
    dz = path.end[1] - path.start[1];
  }
  let length = Math.hypot(dx, dz);
  if (length <= EPSILON) {
    const delta = 1e-4;
    const before = pointAt(path, Math.max(0, t - delta));
    const after = pointAt(path, Math.min(1, t + delta));
    dx = after[0] - before[0];
    dz = after[1] - before[1];
    length = Math.hypot(dx, dz);
  }
  if (length <= EPSILON || !Number.isFinite(length)) return [1, 0];
  return [dx / length, dz / length];
}

function distance(a: RuntimeVec2, b: RuntimeVec2) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function curvePositions(path: RuntimeWallPath) {
  if (!path.control) return [0, 1];
  const positions = [0];
  const subdivide = (t0: number, t1: number, depth: number) => {
    const p0 = pointAt(path, t0);
    const p1 = pointAt(path, t1);
    const tm = (t0 + t1) / 2;
    const pm = pointAt(path, tm);
    const chordMid: RuntimeVec2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const chordLength = distance(p0, p1);
    const deviation = distance(pm, chordMid);
    if (
      depth < MAX_SUBDIVISION_DEPTH &&
      (chordLength > MAX_CURVE_SEGMENT_LENGTH || deviation > MAX_CURVE_DEVIATION)
    ) {
      subdivide(t0, tm, depth + 1);
      subdivide(tm, t1, depth + 1);
      return;
    }
    positions.push(t1);
  };
  subdivide(0, 1, 0);
  return positions;
}

function bracketByPosition(nodes: RuntimeWallPathNode[], position: number) {
  const target = clamp01(position);
  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (target <= nodes[index + 1].position + EPSILON) return [nodes[index], nodes[index + 1]] as const;
  }
  return [nodes[nodes.length - 2], nodes[nodes.length - 1]] as const;
}

function bracketByDistance(nodes: RuntimeWallPathNode[], targetDistance: number) {
  const target = Math.max(0, Math.min(nodes[nodes.length - 1].distance, targetDistance));
  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (target <= nodes[index + 1].distance + EPSILON) return [nodes[index], nodes[index + 1]] as const;
  }
  return [nodes[nodes.length - 2], nodes[nodes.length - 1]] as const;
}

export function compileRuntimeWallPathProfile(wall: RuntimeWallEntity): RuntimeWallPathProfile {
  const positions = curvePositions(wall.path);
  let cumulative = 0;
  let previous = pointAt(wall.path, positions[0]);
  const nodes: RuntimeWallPathNode[] = positions.map((position, index) => {
    const point = index === 0 ? previous : pointAt(wall.path, position);
    if (index > 0) cumulative += distance(previous, point);
    previous = point;
    const tangent = tangentAt(wall.path, position);
    return {
      position,
      distance: cumulative,
      point,
      tangent,
      normal: [-tangent[1], tangent[0]],
      height: wall.startHeight + (wall.endHeight - wall.startHeight) * position,
    };
  });
  const length = cumulative;

  const positionAt = (targetDistance: number) => {
    if (!Number.isFinite(targetDistance) || !Number.isFinite(length)) return NaN;
    if (length <= EPSILON || targetDistance <= 0) return 0;
    if (targetDistance >= length) return 1;
    const [a, b] = bracketByDistance(nodes, targetDistance);
    const span = b.distance - a.distance;
    if (span <= EPSILON) return a.position;
    const ratio = (targetDistance - a.distance) / span;
    return a.position + (b.position - a.position) * ratio;
  };

  const distanceAt = (position: number) => {
    if (!Number.isFinite(position) || !Number.isFinite(length)) return NaN;
    if (length <= EPSILON || position <= 0) return 0;
    if (position >= 1) return length;
    const [a, b] = bracketByPosition(nodes, position);
    const span = b.position - a.position;
    if (span <= EPSILON) return a.distance;
    const ratio = (position - a.position) / span;
    return a.distance + (b.distance - a.distance) * ratio;
  };

  const sampleDistance = (targetDistance: number): RuntimeWallPathSample => {
    const position = positionAt(targetDistance);
    const point = pointAt(wall.path, position);
    const tangent = tangentAt(wall.path, position);
    return {
      position,
      distance: Math.max(0, Math.min(length, targetDistance)),
      point,
      tangent,
      normal: [-tangent[1], tangent[0]],
      height: wall.startHeight + (wall.endHeight - wall.startHeight) * position,
    };
  };

  return { length, nodes, sampleDistance, distanceAt, positionAt };
}
