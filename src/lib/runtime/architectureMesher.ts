import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeDoorEntity,
  RuntimeVec2,
  RuntimeVec3,
  RuntimeWallEntity,
  RuntimeWindowEntity,
} from './types';
import { compileRoomSurfaceMesh } from './roomSurfaceMesher';
import { compileRuntimeWallPathProfile, type RuntimeWallPathProfile } from './wallPathGeometry';

const EPSILON = 1e-9;
const JOIN_POINT_EPSILON = 1e-6;
const JOIN_HEIGHT_EPSILON = 1e-6;
const PARALLEL_EPSILON = 1e-8;
const MITER_LIMIT_FACTOR = 12;

export interface ArchitectureMeshPrimitive {
  id: string;
  kind: 'wall' | 'floor' | 'ceiling';
  ownerId: string;
  floorId: string;
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

export type ArchitectureMeshDiagnosticCode =
  | 'unsupported-wall-boundary'
  | 'degenerate-wall'
  | 'invalid-opening'
  | 'overlapping-openings'
  | 'wall-junction-fallback'
  | 'invalid-room-surface';

export interface ArchitectureMeshDiagnostic {
  code: ArchitectureMeshDiagnosticCode;
  entityId: string;
  message: string;
}

/**
 * Engine-neutral presentation geometry. Runtime JSON keeps semantics, collision
 * and interaction; a later packaging step can serialize this geometry to GLB.
 */
export interface ArchitectureMesh {
  units: 'metres';
  coordinates: Plan2WorldRuntimeSceneV1['coordinates'];
  primitives: ArchitectureMeshPrimitive[];
  diagnostics: ArchitectureMeshDiagnostic[];
}

interface OpeningRect {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface MeshBuilder {
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

interface SolidSpan {
  bottom: number;
  topA: number;
  topB: number;
}

type WallSide = 'front' | 'back';
type WallEndpoint = 'start' | 'end';

interface WallEndpointJoin {
  cap: boolean;
  front?: RuntimeVec2;
  back?: RuntimeVec2;
}

interface WallJoin {
  start: WallEndpointJoin;
  end: WallEndpointJoin;
}

interface JunctionRef {
  wall: RuntimeWallEntity;
  endpoint: WallEndpoint;
  point: RuntimeVec2;
  away: RuntimeVec2;
  halfThickness: number;
  height: number;
  leftKey: WallSide;
  rightKey: WallSide;
  leftPoint: RuntimeVec2;
  rightPoint: RuntimeVec2;
}

function near(a: number, b: number, epsilon = EPSILON) {
  return Math.abs(a - b) <= epsilon;
}

function add2(a: RuntimeVec2, b: RuntimeVec2): RuntimeVec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

function subtract2(a: RuntimeVec2, b: RuntimeVec2): RuntimeVec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function scale2(value: RuntimeVec2, scale: number): RuntimeVec2 {
  return [value[0] * scale, value[1] * scale];
}

function cross2(a: RuntimeVec2, b: RuntimeVec2) {
  return a[0] * b[1] - a[1] * b[0];
}

function distance2(a: RuntimeVec2, b: RuntimeVec2) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function normalize3(value: RuntimeVec3): RuntimeVec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= EPSILON || !Number.isFinite(length)) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function faceNormal(points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3]): RuntimeVec3 {
  const a: RuntimeVec3 = [
    points[1][0] - points[0][0],
    points[1][1] - points[0][1],
    points[1][2] - points[0][2],
  ];
  const b: RuntimeVec3 = [
    points[3][0] - points[0][0],
    points[3][1] - points[0][1],
    points[3][2] - points[0][2],
  ];
  return normalize3([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]);
}

function addQuad(
  builder: MeshBuilder,
  points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3],
  normal: RuntimeVec3,
  uvs: [RuntimeVec2, RuntimeVec2, RuntimeVec2, RuntimeVec2],
) {
  const base = builder.positions.length;
  builder.positions.push(...points);
  builder.normals.push(normal, normal, normal, normal);
  builder.uvs.push(...uvs);
  builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addQuadWithNormals(
  builder: MeshBuilder,
  points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3],
  normals: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3],
  uvs: [RuntimeVec2, RuntimeVec2, RuntimeVec2, RuntimeVec2],
) {
  const base = builder.positions.length;
  builder.positions.push(...points);
  builder.normals.push(...normals);
  builder.uvs.push(...uvs);
  builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addFaceQuad(
  builder: MeshBuilder,
  points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3],
  uvs: [RuntimeVec2, RuntimeVec2, RuntimeVec2, RuntimeVec2],
) {
  addQuad(builder, points, faceNormal(points), uvs);
}

function uniqueSorted(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of sorted) {
    if (result.length === 0 || !near(result[result.length - 1], value)) result.push(value);
  }
  return result;
}

function mergeVerticalIntervals(openings: OpeningRect[]) {
  const intervals = openings.map(opening => [opening.y0, opening.y1] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    const previous = merged[merged.length - 1];
    if (!previous || start > previous[1] + EPSILON) merged.push([start, end]);
    else previous[1] = Math.max(previous[1], end);
  }
  return merged;
}

function solidSpans(topA: number, topB: number, openings: OpeningRect[]): SolidSpan[] {
  const spans: SolidSpan[] = [];
  let cursor = 0;
  for (const [start, end] of mergeVerticalIntervals(openings)) {
    if (start > cursor + EPSILON) spans.push({ bottom: cursor, topA: start, topB: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < topA - EPSILON || cursor < topB - EPSILON) spans.push({ bottom: cursor, topA, topB });
  return spans;
}

function openingsAtStrip(openings: OpeningRect[], x0: number, x1: number) {
  const midpoint = (x0 + x1) / 2;
  return openings.filter(opening => midpoint > opening.x0 + EPSILON && midpoint < opening.x1 - EPSILON);
}

function openingsAtX(openings: OpeningRect[], x: number) {
  return openings.filter(opening => x >= opening.x0 - EPSILON && x <= opening.x1 + EPSILON);
}

function wallHeightAt(profile: RuntimeWallPathProfile, distance: number) {
  return profile.sampleDistance(distance).height;
}

function openingFromEntity(
  entity: RuntimeDoorEntity | RuntimeWindowEntity,
  profile: RuntimeWallPathProfile,
): OpeningRect | null {
  const center = profile.distanceAt(entity.pathPosition);
  const x0 = center - entity.width / 2;
  const x1 = center + entity.width / 2;
  const y0 = entity.kind === 'window' ? entity.sillHeight : 0;
  const y1 = y0 + entity.height;
  const minTop = Math.min(wallHeightAt(profile, x0), wallHeightAt(profile, x1));

  if (
    !Number.isFinite(center) || !Number.isFinite(entity.width) || !Number.isFinite(entity.height) ||
    entity.width <= EPSILON || entity.height <= EPSILON || x0 < -EPSILON || x1 > profile.length + EPSILON ||
    y0 < -EPSILON || y1 > minTop + EPSILON
  ) return null;

  return {
    id: entity.id,
    x0: Math.max(0, x0),
    x1: Math.min(profile.length, x1),
    y0: Math.max(0, y0),
    y1: Math.min(minTop, y1),
  };
}

function collectOpenings(
  scene: Plan2WorldRuntimeSceneV1,
  wall: RuntimeWallEntity,
  profile: RuntimeWallPathProfile,
  diagnostics: ArchitectureMeshDiagnostic[],
): OpeningRect[] | null {
  const hosted = scene.entities.filter((entity): entity is RuntimeDoorEntity | RuntimeWindowEntity =>
    (entity.kind === 'door' || entity.kind === 'window') && entity.hostWallId === wall.id && entity.floorId === wall.floorId,
  );
  const openings: OpeningRect[] = [];

  for (const entity of hosted) {
    const opening = openingFromEntity(entity, profile);
    if (!opening) {
      diagnostics.push({
        code: 'invalid-opening',
        entityId: entity.id,
        message: `Opening ${entity.id} does not fit host wall ${wall.id}; fix the upstream runtime semantics instead of clipping it in the mesher.`,
      });
      return null;
    }
    openings.push(opening);
  }

  for (let i = 0; i < openings.length; i += 1) {
    for (let j = i + 1; j < openings.length; j += 1) {
      const a = openings[i], b = openings[j];
      const overlapsX = Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1) - EPSILON;
      const overlapsY = Math.max(a.y0, b.y0) < Math.min(a.y1, b.y1) - EPSILON;
      if (overlapsX && overlapsY) {
        diagnostics.push({
          code: 'overlapping-openings',
          entityId: wall.id,
          message: `Openings ${a.id} and ${b.id} overlap on wall ${wall.id}; resolve topology before presentation meshing.`,
        });
        return null;
      }
    }
  }
  return openings;
}

function emptyWallJoin(): WallJoin {
  return { start: { cap: true }, end: { cap: true } };
}

function isMesheableWall(wall: RuntimeWallEntity, profile: RuntimeWallPathProfile) {
  const pathNumbers = [...wall.path.start, ...wall.path.end, ...(wall.path.control ?? [])];
  return wall.visible && wall.boundaryType === 'solid' &&
    pathNumbers.every(Number.isFinite) && Number.isFinite(profile.length) && profile.length > EPSILON &&
    Number.isFinite(wall.thickness) && wall.thickness > EPSILON &&
    Number.isFinite(wall.startHeight) && Number.isFinite(wall.endHeight) &&
    wall.startHeight > EPSILON && wall.endHeight > EPSILON;
}

function junctionRef(
  wall: RuntimeWallEntity,
  profile: RuntimeWallPathProfile,
  endpoint: WallEndpoint,
): JunctionRef {
  const sample = profile.sampleDistance(endpoint === 'start' ? 0 : profile.length);
  const away: RuntimeVec2 = endpoint === 'start'
    ? sample.tangent
    : [-sample.tangent[0], -sample.tangent[1]];
  const leftNormal: RuntimeVec2 = [-away[1], away[0]];
  const halfThickness = wall.thickness / 2;
  return {
    wall,
    endpoint,
    point: sample.point,
    away,
    halfThickness,
    height: sample.height,
    leftKey: endpoint === 'start' ? 'front' : 'back',
    rightKey: endpoint === 'start' ? 'back' : 'front',
    leftPoint: add2(sample.point, scale2(leftNormal, halfThickness)),
    rightPoint: add2(sample.point, scale2(leftNormal, -halfThickness)),
  };
}

function lineIntersectionOrCoincident(
  aPoint: RuntimeVec2,
  aDirection: RuntimeVec2,
  bPoint: RuntimeVec2,
  bDirection: RuntimeVec2,
): RuntimeVec2 | null {
  const denominator = cross2(aDirection, bDirection);
  const delta = subtract2(bPoint, aPoint);
  if (Math.abs(denominator) <= PARALLEL_EPSILON) {
    if (Math.abs(cross2(delta, aDirection)) <= JOIN_POINT_EPSILON * 4) {
      return [(aPoint[0] + bPoint[0]) / 2, (aPoint[1] + bPoint[1]) / 2];
    }
    return null;
  }
  const t = cross2(delta, bDirection) / denominator;
  const intersection = add2(aPoint, scale2(aDirection, t));
  return intersection.every(Number.isFinite) ? intersection : null;
}

function pushJunctionFallback(
  diagnostics: ArchitectureMeshDiagnostic[],
  group: JunctionRef[],
  reason: string,
) {
  const ids = [...new Set(group.map(ref => ref.wall.id))].sort();
  diagnostics.push({
    code: 'wall-junction-fallback',
    entityId: ids[0] ?? 'unknown-wall',
    message: `Wall junction [${ids.join(', ')}] kept closed end caps: ${reason}.`,
  });
}

function compileWallJunctions(
  walls: RuntimeWallEntity[],
  profiles: Map<string, RuntimeWallPathProfile>,
  diagnostics: ArchitectureMeshDiagnostic[],
) {
  const joins = new Map<string, WallJoin>();
  const groups: JunctionRef[][] = [];

  for (const wall of walls) {
    const profile = profiles.get(wall.id);
    if (!profile || !isMesheableWall(wall, profile)) continue;
    joins.set(wall.id, emptyWallJoin());
    for (const endpoint of ['start', 'end'] as const) {
      const ref = junctionRef(wall, profile, endpoint);
      let group = groups.find(candidate =>
        candidate[0].wall.floorId === wall.floorId &&
        distance2(candidate[0].point, ref.point) <= JOIN_POINT_EPSILON,
      );
      if (!group) {
        group = [];
        groups.push(group);
      }
      group.push(ref);
    }
  }

  for (const group of groups) {
    if (group.length < 2) continue;
    if (new Set(group.map(ref => ref.wall.id)).size !== group.length) {
      pushJunctionFallback(diagnostics, group, 'the same wall reaches the junction more than once');
      continue;
    }
    const heights = group.map(ref => ref.height);
    if (Math.max(...heights) - Math.min(...heights) > JOIN_HEIGHT_EPSILON) {
      pushJunctionFallback(diagnostics, group, 'endpoint heights disagree');
      continue;
    }

    const ordered = [...group].sort((a, b) => {
      const angleA = Math.atan2(a.away[1], a.away[0]);
      const angleB = Math.atan2(b.away[1], b.away[0]);
      if (!near(angleA, angleB, PARALLEL_EPSILON)) return angleA - angleB;
      return a.wall.id.localeCompare(b.wall.id) || a.endpoint.localeCompare(b.endpoint);
    });
    const candidates = new Map<JunctionRef, { left: RuntimeVec2; right: RuntimeVec2 }>();
    const junctionCenter: RuntimeVec2 = [
      group.reduce((sum, ref) => sum + ref.point[0], 0) / group.length,
      group.reduce((sum, ref) => sum + ref.point[1], 0) / group.length,
    ];
    const maxHalfThickness = Math.max(...group.map(ref => ref.halfThickness));
    const miterLimit = Math.max(JOIN_POINT_EPSILON * 10, maxHalfThickness * MITER_LIMIT_FACTOR);
    let failed = false;

    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const next = ordered[(index + 1) % ordered.length];
      const previous = ordered[(index - 1 + ordered.length) % ordered.length];
      const left = lineIntersectionOrCoincident(current.leftPoint, current.away, next.rightPoint, next.away);
      const right = lineIntersectionOrCoincident(current.rightPoint, current.away, previous.leftPoint, previous.away);
      if (
        !left || !right ||
        distance2(junctionCenter, left) > miterLimit ||
        distance2(junctionCenter, right) > miterLimit
      ) {
        failed = true;
        break;
      }
      candidates.set(current, { left, right });
    }

    if (failed || candidates.size !== ordered.length) {
      pushJunctionFallback(diagnostics, group, 'offset boundaries do not form a bounded deterministic miter');
      continue;
    }

    for (const ref of ordered) {
      const candidate = candidates.get(ref)!;
      const join = joins.get(ref.wall.id)!;
      const endpointJoin = join[ref.endpoint];
      endpointJoin.cap = false;
      endpointJoin[ref.leftKey] = candidate.left;
      endpointJoin[ref.rightKey] = candidate.right;
    }
  }

  return joins;
}

function endpointOverride(join: WallJoin, profile: RuntimeWallPathProfile, distance: number, side: WallSide) {
  if (near(distance, 0)) return join.start[side];
  if (near(distance, profile.length)) return join.end[side];
  return undefined;
}

function sidePlanPoint(
  profile: RuntimeWallPathProfile,
  join: WallJoin,
  distance: number,
  halfThickness: number,
  side: WallSide,
): RuntimeVec2 {
  const override = endpointOverride(join, profile, distance, side);
  if (override) return override;
  const sample = profile.sampleDistance(distance);
  const sign = side === 'front' ? 1 : -1;
  return [
    sample.point[0] + sample.normal[0] * halfThickness * sign,
    sample.point[1] + sample.normal[1] * halfThickness * sign,
  ];
}

function wallPoint(
  profile: RuntimeWallPathProfile,
  join: WallJoin,
  floorElevation: number,
  halfThickness: number,
  distance: number,
  y: number,
  side: WallSide,
): RuntimeVec3 {
  const point = sidePlanPoint(profile, join, distance, halfThickness, side);
  return [point[0], floorElevation + y, point[1]];
}

function sideNormal(profile: RuntimeWallPathProfile, distance: number, side: WallSide): RuntimeVec3 {
  const sample = profile.sampleDistance(distance);
  const sign = side === 'front' ? 1 : -1;
  return [sample.normal[0] * sign, 0, sample.normal[1] * sign];
}

function compileWall(
  scene: Plan2WorldRuntimeSceneV1,
  wall: RuntimeWallEntity,
  profile: RuntimeWallPathProfile,
  join: WallJoin,
  floorElevation: number,
  diagnostics: ArchitectureMeshDiagnostic[],
): ArchitectureMeshPrimitive | null {
  if (!wall.visible || wall.boundaryType === 'air') return null;
  if (wall.boundaryType !== 'solid') {
    diagnostics.push({
      code: 'unsupported-wall-boundary',
      entityId: wall.id,
      message: `Wall boundary ${wall.boundaryType} is not supported by the architecture mesher.`,
    });
    return null;
  }
  if (!isMesheableWall(wall, profile)) {
    diagnostics.push({ code: 'degenerate-wall', entityId: wall.id, message: `Wall ${wall.id} has degenerate presentation dimensions.` });
    return null;
  }

  const openings = collectOpenings(scene, wall, profile, diagnostics);
  if (!openings) return null;

  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const half = wall.thickness / 2;
  const cuts = uniqueSorted([
    0,
    profile.length,
    ...profile.nodes.map(node => node.distance),
    ...openings.flatMap(opening => [opening.x0, opening.x1]),
  ]);

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const x0 = cuts[index], x1 = cuts[index + 1];
    if (x1 - x0 <= EPSILON) continue;
    const top0 = wallHeightAt(profile, x0), top1 = wallHeightAt(profile, x1);
    const spans = solidSpans(top0, top1, openingsAtStrip(openings, x0, x1));

    for (const span of spans) {
      if (Math.max(span.topA, span.topB) <= span.bottom + EPSILON) continue;
      addQuadWithNormals(builder,
        [
          wallPoint(profile, join, floorElevation, half, x0, span.bottom, 'front'),
          wallPoint(profile, join, floorElevation, half, x1, span.bottom, 'front'),
          wallPoint(profile, join, floorElevation, half, x1, span.topB, 'front'),
          wallPoint(profile, join, floorElevation, half, x0, span.topA, 'front'),
        ],
        [
          sideNormal(profile, x0, 'front'),
          sideNormal(profile, x1, 'front'),
          sideNormal(profile, x1, 'front'),
          sideNormal(profile, x0, 'front'),
        ],
        [[x0, span.bottom], [x1, span.bottom], [x1, span.topB], [x0, span.topA]],
      );
      addQuadWithNormals(builder,
        [
          wallPoint(profile, join, floorElevation, half, x1, span.bottom, 'back'),
          wallPoint(profile, join, floorElevation, half, x0, span.bottom, 'back'),
          wallPoint(profile, join, floorElevation, half, x0, span.topA, 'back'),
          wallPoint(profile, join, floorElevation, half, x1, span.topB, 'back'),
        ],
        [
          sideNormal(profile, x1, 'back'),
          sideNormal(profile, x0, 'back'),
          sideNormal(profile, x0, 'back'),
          sideNormal(profile, x1, 'back'),
        ],
        [[x1, span.bottom], [x0, span.bottom], [x0, span.topA], [x1, span.topB]],
      );
    }

    if (spans.some(span => near(span.topA, top0) && near(span.topB, top1))) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = [
        wallPoint(profile, join, floorElevation, half, x0, top0, 'back'),
        wallPoint(profile, join, floorElevation, half, x0, top0, 'front'),
        wallPoint(profile, join, floorElevation, half, x1, top1, 'front'),
        wallPoint(profile, join, floorElevation, half, x1, top1, 'back'),
      ];
      addFaceQuad(builder, points, [[x0, 0], [x0, wall.thickness], [x1, wall.thickness], [x1, 0]]);
    }

    if (spans.some(span => near(span.bottom, 0))) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = [
        wallPoint(profile, join, floorElevation, half, x0, 0, 'back'),
        wallPoint(profile, join, floorElevation, half, x1, 0, 'back'),
        wallPoint(profile, join, floorElevation, half, x1, 0, 'front'),
        wallPoint(profile, join, floorElevation, half, x0, 0, 'front'),
      ];
      addFaceQuad(builder, points, [[x0, 0], [x1, 0], [x1, wall.thickness], [x0, wall.thickness]]);
    }
  }

  for (const [x, endpoint] of [[0, join.start], [profile.length, join.end]] as const) {
    if (!endpoint.cap) continue;
    const top = wallHeightAt(profile, x);
    for (const span of solidSpans(top, top, openingsAtX(openings, x))) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = near(x, 0)
        ? [
            wallPoint(profile, join, floorElevation, half, x, span.bottom, 'back'),
            wallPoint(profile, join, floorElevation, half, x, span.bottom, 'front'),
            wallPoint(profile, join, floorElevation, half, x, span.topA, 'front'),
            wallPoint(profile, join, floorElevation, half, x, span.topA, 'back'),
          ]
        : [
            wallPoint(profile, join, floorElevation, half, x, span.bottom, 'front'),
            wallPoint(profile, join, floorElevation, half, x, span.bottom, 'back'),
            wallPoint(profile, join, floorElevation, half, x, span.topA, 'back'),
            wallPoint(profile, join, floorElevation, half, x, span.topA, 'front'),
          ];
      addFaceQuad(builder, points, [[0, span.bottom], [wall.thickness, span.bottom], [wall.thickness, span.topA], [0, span.topA]]);
    }
  }

  for (const opening of openings) {
    if (opening.x0 > EPSILON) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = [
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y0, 'front'),
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y0, 'back'),
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y1, 'back'),
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y1, 'front'),
      ];
      addFaceQuad(builder, points, [[0, opening.y0], [wall.thickness, opening.y0], [wall.thickness, opening.y1], [0, opening.y1]]);
    }
    if (opening.x1 < profile.length - EPSILON) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = [
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y0, 'back'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y0, 'front'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y1, 'front'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y1, 'back'),
      ];
      addFaceQuad(builder, points, [[0, opening.y0], [wall.thickness, opening.y0], [wall.thickness, opening.y1], [0, opening.y1]]);
    }
    if (opening.y0 > EPSILON) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = [
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y0, 'back'),
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y0, 'front'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y0, 'front'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y0, 'back'),
      ];
      addFaceQuad(builder, points, [[opening.x0, 0], [opening.x0, wall.thickness], [opening.x1, wall.thickness], [opening.x1, 0]]);
    }
    const maxTop = Math.max(wallHeightAt(profile, opening.x0), wallHeightAt(profile, opening.x1));
    if (opening.y1 < maxTop - EPSILON) {
      const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = [
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y1, 'back'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y1, 'back'),
        wallPoint(profile, join, floorElevation, half, opening.x1, opening.y1, 'front'),
        wallPoint(profile, join, floorElevation, half, opening.x0, opening.y1, 'front'),
      ];
      addFaceQuad(builder, points, [[opening.x0, 0], [opening.x1, 0], [opening.x1, wall.thickness], [opening.x0, wall.thickness]]);
    }
  }

  return {
    id: `architecture:wall:${wall.id}`,
    kind: 'wall',
    ownerId: wall.id,
    floorId: wall.floorId,
    ...builder,
  };
}

export function compileArchitectureMesh(scene: Plan2WorldRuntimeSceneV1): ArchitectureMesh {
  const diagnostics: ArchitectureMeshDiagnostic[] = [];
  const primitives: ArchitectureMeshPrimitive[] = [];
  const floorElevations = new Map(scene.floors.map(floor => [floor.id, floor.elevation]));
  const walls = scene.entities.filter((entity): entity is RuntimeWallEntity => entity.kind === 'wall');
  const profiles = new Map(walls.map(wall => [wall.id, compileRuntimeWallPathProfile(wall)]));
  const joins = compileWallJunctions(walls, profiles, diagnostics);

  for (const wall of walls) {
    const floorElevation = floorElevations.get(wall.floorId);
    if (floorElevation === undefined) {
      diagnostics.push({ code: 'degenerate-wall', entityId: wall.id, message: `Wall ${wall.id} references missing floor ${wall.floorId}.` });
      continue;
    }
    const profile = profiles.get(wall.id)!;
    const primitive = compileWall(scene, wall, profile, joins.get(wall.id) ?? emptyWallJoin(), floorElevation, diagnostics);
    if (primitive) primitives.push(primitive);
  }

  for (const floor of scene.floors) {
    for (const room of floor.rooms) {
      const result = compileRoomSurfaceMesh(room, floor.id, floor.elevation);
      primitives.push(...result.primitives);
      diagnostics.push(...result.diagnostics);
    }
  }

  return { units: 'metres', coordinates: scene.coordinates, primitives, diagnostics };
}
