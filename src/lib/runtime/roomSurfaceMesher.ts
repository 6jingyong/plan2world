import type { RuntimeRoomSurface, RuntimeVec2, RuntimeVec3 } from './types';
import { triangulatePolygonWithHoles, type TriangulatedPolygon } from './polygonTriangulation';

const EPSILON = 1e-9;

export interface RoomSurfaceMeshPrimitive {
  id: string;
  kind: 'floor' | 'ceiling';
  ownerId: string;
  floorId: string;
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

export interface RoomSurfaceMeshDiagnostic {
  code: 'invalid-room-surface';
  entityId: string;
  message: string;
}

interface MeshBuilder {
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

function signedArea(points: RuntimeVec2[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function addPlanarFace(
  builder: MeshBuilder,
  triangulated: TriangulatedPolygon,
  elevation: number,
  normal: RuntimeVec3,
  reverseWinding: boolean,
) {
  const base = builder.positions.length;
  for (const point of triangulated.vertices) {
    builder.positions.push([point[0], elevation, point[1]]);
    builder.normals.push(normal);
    builder.uvs.push([point[0], point[1]]);
  }
  for (const [a, b, c] of triangulated.triangles) {
    if (reverseWinding) builder.indices.push(base + a, base + c, base + b);
    else builder.indices.push(base + a, base + b, base + c);
  }
}

function addBoundarySides(
  builder: MeshBuilder,
  ring: RuntimeVec2[],
  top: number,
  bottom: number,
  outwardSide: 'right' | 'left',
) {
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index], b = ring[(index + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length <= EPSILON) continue;
    const rightNormal: RuntimeVec3 = [dz / length, 0, -dx / length];
    const normal: RuntimeVec3 = outwardSide === 'right'
      ? rightNormal
      : [-rightNormal[0], 0, -rightNormal[2]];
    const base = builder.positions.length;
    const points: [RuntimeVec3, RuntimeVec3, RuntimeVec3, RuntimeVec3] = outwardSide === 'right'
      ? [[a[0], top, a[1]], [b[0], top, b[1]], [b[0], bottom, b[1]], [a[0], bottom, a[1]]]
      : [[b[0], top, b[1]], [a[0], top, a[1]], [a[0], bottom, a[1]], [b[0], bottom, b[1]]];
    builder.positions.push(...points);
    builder.normals.push(normal, normal, normal, normal);
    builder.uvs.push([0, 0], [length, 0], [length, top - bottom], [0, top - bottom]);
    builder.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function compileFloorSlab(
  room: RuntimeRoomSurface,
  floorId: string,
  elevation: number,
  triangulated: TriangulatedPolygon,
): RoomSurfaceMeshPrimitive {
  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const bottom = elevation - room.slabThickness;
  addPlanarFace(builder, triangulated, elevation, [0, 1, 0], true);
  addPlanarFace(builder, triangulated, bottom, [0, -1, 0], false);

  const outerSide = signedArea(room.polygon) >= 0 ? 'right' : 'left';
  addBoundarySides(builder, room.polygon, elevation, bottom, outerSide);
  for (const hole of room.holes) {
    const holeSide = signedArea(hole) >= 0 ? 'left' : 'right';
    addBoundarySides(builder, hole, elevation, bottom, holeSide);
  }

  return {
    id: `architecture:floor:${room.id}`,
    kind: 'floor',
    ownerId: room.id,
    floorId,
    ...builder,
  };
}

function compileCeiling(
  room: RuntimeRoomSurface,
  floorId: string,
  elevation: number,
  triangulated: TriangulatedPolygon,
): RoomSurfaceMeshPrimitive | null {
  if (room.ceilingHeight === null) return null;
  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  addPlanarFace(builder, triangulated, elevation + room.ceilingHeight, [0, -1, 0], false);
  return {
    id: `architecture:ceiling:${room.id}`,
    kind: 'ceiling',
    ownerId: room.id,
    floorId,
    ...builder,
  };
}

export function compileRoomSurfaceMesh(
  room: RuntimeRoomSurface,
  floorId: string,
  elevation: number,
): { primitives: RoomSurfaceMeshPrimitive[]; diagnostics: RoomSurfaceMeshDiagnostic[] } {
  if (!Number.isFinite(elevation) || !Number.isFinite(room.slabThickness) || room.slabThickness <= EPSILON) {
    return {
      primitives: [],
      diagnostics: [{
        code: 'invalid-room-surface',
        entityId: room.id,
        message: `Room ${room.id} has invalid floor elevation or slab thickness; fix the upstream runtime surface instead of repairing it in the mesher.`,
      }],
    };
  }
  if (room.ceilingHeight !== null && (!Number.isFinite(room.ceilingHeight) || room.ceilingHeight <= EPSILON)) {
    return {
      primitives: [],
      diagnostics: [{
        code: 'invalid-room-surface',
        entityId: room.id,
        message: `Room ${room.id} has invalid ceiling height; use null for no ceiling or provide a positive finite height.`,
      }],
    };
  }

  const triangulated = triangulatePolygonWithHoles(room.polygon, room.holes);
  if (!triangulated) {
    return {
      primitives: [],
      diagnostics: [{
        code: 'invalid-room-surface',
        entityId: room.id,
        message: `Room ${room.id} polygon/holes cannot be triangulated deterministically; fix the upstream room surface instead of guessing presentation geometry.`,
      }],
    };
  }

  const primitives: RoomSurfaceMeshPrimitive[] = [compileFloorSlab(room, floorId, elevation, triangulated)];
  const ceiling = compileCeiling(room, floorId, elevation, triangulated);
  if (ceiling) primitives.push(ceiling);
  return { primitives, diagnostics: [] };
}
