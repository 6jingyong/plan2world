import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeDoorEntity,
  RuntimeVec2,
  RuntimeVec3,
  RuntimeWallEntity,
  RuntimeWindowEntity,
} from './types';

const EPSILON = 1e-9;

export interface ArchitectureMeshPrimitive {
  id: string;
  kind: 'wall';
  ownerId: string;
  floorId: string;
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

export type ArchitectureMeshDiagnosticCode =
  | 'unsupported-curved-wall'
  | 'unsupported-wall-boundary'
  | 'degenerate-wall'
  | 'invalid-opening'
  | 'overlapping-openings';

export interface ArchitectureMeshDiagnostic {
  code: ArchitectureMeshDiagnosticCode;
  entityId: string;
  message: string;
}

/**
 * In-memory, engine-neutral presentation geometry. This is deliberately separate
 * from plan2world-runtime-v1: runtime JSON keeps semantics/collision/interaction,
 * while a later packaging step can serialize these primitives to GLB.
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

interface WallFrame {
  length: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  floorElevation: number;
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

function near(a: number, b: number) {
  return Math.abs(a - b) <= EPSILON;
}

function wallHeightAt(wall: RuntimeWallEntity, frame: WallFrame, x: number) {
  const t = frame.length > EPSILON ? x / frame.length : 0;
  return wall.startHeight + (wall.endHeight - wall.startHeight) * t;
}

function localPoint(wall: RuntimeWallEntity, frame: WallFrame, x: number, y: number, z: number): RuntimeVec3 {
  return [
    wall.path.start[0] + frame.tx * x + frame.nx * z,
    frame.floorElevation + y,
    wall.path.start[1] + frame.tz * x + frame.nz * z,
  ];
}

function localNormal(frame: WallFrame, x: number, y: number, z: number): RuntimeVec3 {
  return [frame.tx * x + frame.nx * z, y, frame.tz * x + frame.nz * z];
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

function uniqueSorted(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of sorted) {
    if (result.length === 0 || !near(result[result.length - 1], value)) result.push(value);
  }
  return result;
}

function mergeVerticalIntervals(openings: OpeningRect[]) {
  const intervals = openings.map(opening => [opening.y0, opening.y1] as const).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    const previous = merged[merged.length - 1];
    if (!previous || start > previous[1] + EPSILON) merged.push([start, end]);
    else previous[1] = Math.max(previous[1], end);
  }
  return merged;
}

function solidSpans(topA: number, topB: number, openings: OpeningRect[]): SolidSpan[] {
  const intervals = mergeVerticalIntervals(openings);
  const spans: SolidSpan[] = [];
  let cursor = 0;

  for (const [start, end] of intervals) {
    if (start > cursor + EPSILON) spans.push({ bottom: cursor, topA: start, topB: start });
    cursor = Math.max(cursor, end);
  }

  if (cursor < topA - EPSILON || cursor < topB - EPSILON) {
    spans.push({ bottom: cursor, topA, topB });
  }
  return spans;
}

function openingsAtStrip(openings: OpeningRect[], x0: number, x1: number) {
  const midpoint = (x0 + x1) / 2;
  return openings.filter(opening => midpoint > opening.x0 + EPSILON && midpoint < opening.x1 - EPSILON);
}

function openingsAtX(openings: OpeningRect[], x: number) {
  return openings.filter(opening => x >= opening.x0 - EPSILON && x <= opening.x1 + EPSILON);
}

function openingFromEntity(
  entity: RuntimeDoorEntity | RuntimeWindowEntity,
  wall: RuntimeWallEntity,
  frame: WallFrame,
): OpeningRect | null {
  const center = entity.pathPosition * frame.length;
  const x0 = center - entity.width / 2;
  const x1 = center + entity.width / 2;
  const y0 = entity.kind === 'window' ? entity.sillHeight : 0;
  const y1 = y0 + entity.height;
  const minTop = Math.min(wallHeightAt(wall, frame, x0), wallHeightAt(wall, frame, x1));

  if (
    !Number.isFinite(center) || !Number.isFinite(entity.width) || !Number.isFinite(entity.height) ||
    entity.width <= EPSILON || entity.height <= EPSILON || x0 < -EPSILON || x1 > frame.length + EPSILON ||
    y0 < -EPSILON || y1 > minTop + EPSILON
  ) return null;

  return {
    id: entity.id,
    x0: Math.max(0, x0),
    x1: Math.min(frame.length, x1),
    y0: Math.max(0, y0),
    y1: Math.min(minTop, y1),
  };
}

function collectOpenings(
  scene: Plan2WorldRuntimeSceneV1,
  wall: RuntimeWallEntity,
  frame: WallFrame,
  diagnostics: ArchitectureMeshDiagnostic[],
): OpeningRect[] | null {
  const hosted = scene.entities.filter((entity): entity is RuntimeDoorEntity | RuntimeWindowEntity =>
    (entity.kind === 'door' || entity.kind === 'window') && entity.hostWallId === wall.id && entity.floorId === wall.floorId,
  );
  const openings: OpeningRect[] = [];

  for (const entity of hosted) {
    const opening = openingFromEntity(entity, wall, frame);
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

function compileStraightWall(
  scene: Plan2WorldRuntimeSceneV1,
  wall: RuntimeWallEntity,
  floorElevation: number,
  diagnostics: ArchitectureMeshDiagnostic[],
): ArchitectureMeshPrimitive | null {
  if (!wall.visible || wall.boundaryType === 'air') return null;
  if (wall.boundaryType !== 'solid') {
    diagnostics.push({
      code: 'unsupported-wall-boundary',
      entityId: wall.id,
      message: `Wall boundary ${wall.boundaryType} is not part of architecture mesher v0.`,
    });
    return null;
  }
  if (wall.path.control) {
    diagnostics.push({
      code: 'unsupported-curved-wall',
      entityId: wall.id,
      message: `Curved wall ${wall.id} is preserved semantically but is not tessellated by architecture mesher v0.`,
    });
    return null;
  }

  const dx = wall.path.end[0] - wall.path.start[0];
  const dz = wall.path.end[1] - wall.path.start[1];
  const length = Math.hypot(dx, dz);
  if (
    length <= EPSILON || wall.thickness <= EPSILON || wall.startHeight <= EPSILON || wall.endHeight <= EPSILON ||
    !Number.isFinite(length) || !Number.isFinite(wall.thickness) ||
    !Number.isFinite(wall.startHeight) || !Number.isFinite(wall.endHeight)
  ) {
    diagnostics.push({ code: 'degenerate-wall', entityId: wall.id, message: `Wall ${wall.id} has degenerate presentation dimensions.` });
    return null;
  }

  const frame: WallFrame = {
    length,
    tx: dx / length,
    tz: dz / length,
    nx: -dz / length,
    nz: dx / length,
    floorElevation,
  };
  const openings = collectOpenings(scene, wall, frame, diagnostics);
  if (!openings) return null;

  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const half = wall.thickness / 2;
  const cuts = uniqueSorted([0, length, ...openings.flatMap(opening => [opening.x0, opening.x1])]);
  const frontNormal = localNormal(frame, 0, 0, 1);
  const backNormal = localNormal(frame, 0, 0, -1);
  const upNormal = localNormal(frame, 0, 1, 0);
  const downNormal = localNormal(frame, 0, -1, 0);

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const x0 = cuts[index], x1 = cuts[index + 1];
    if (x1 - x0 <= EPSILON) continue;
    const top0 = wallHeightAt(wall, frame, x0), top1 = wallHeightAt(wall, frame, x1);
    const active = openingsAtStrip(openings, x0, x1);
    const spans = solidSpans(top0, top1, active);

    for (const span of spans) {
      if (Math.max(span.topA, span.topB) <= span.bottom + EPSILON) continue;
      addQuad(builder,
        [
          localPoint(wall, frame, x0, span.bottom, half),
          localPoint(wall, frame, x1, span.bottom, half),
          localPoint(wall, frame, x1, span.topB, half),
          localPoint(wall, frame, x0, span.topA, half),
        ], frontNormal,
        [[x0, span.bottom], [x1, span.bottom], [x1, span.topB], [x0, span.topA]],
      );
      addQuad(builder,
        [
          localPoint(wall, frame, x1, span.bottom, -half),
          localPoint(wall, frame, x0, span.bottom, -half),
          localPoint(wall, frame, x0, span.topA, -half),
          localPoint(wall, frame, x1, span.topB, -half),
        ], backNormal,
        [[x1, span.bottom], [x0, span.bottom], [x0, span.topA], [x1, span.topB]],
      );
    }

    const topSpan = spans.find(span => near(span.topA, top0) && near(span.topB, top1));
    if (topSpan) {
      addQuad(builder,
        [
          localPoint(wall, frame, x0, top0, -half),
          localPoint(wall, frame, x0, top0, half),
          localPoint(wall, frame, x1, top1, half),
          localPoint(wall, frame, x1, top1, -half),
        ], upNormal,
        [[x0, 0], [x0, wall.thickness], [x1, wall.thickness], [x1, 0]],
      );
    }

    const bottomSpan = spans.find(span => near(span.bottom, 0));
    if (bottomSpan) {
      addQuad(builder,
        [
          localPoint(wall, frame, x0, 0, -half),
          localPoint(wall, frame, x1, 0, -half),
          localPoint(wall, frame, x1, 0, half),
          localPoint(wall, frame, x0, 0, half),
        ], downNormal,
        [[x0, 0], [x1, 0], [x1, wall.thickness], [x0, wall.thickness]],
      );
    }
  }

  for (const [x, normalX] of [[0, -1], [length, 1]] as const) {
    const top = wallHeightAt(wall, frame, x);
    const spans = solidSpans(top, top, openingsAtX(openings, x));
    const normal = localNormal(frame, normalX, 0, 0);
    for (const span of spans) {
      if (normalX < 0) {
        addQuad(builder,
          [
            localPoint(wall, frame, x, span.bottom, -half),
            localPoint(wall, frame, x, span.bottom, half),
            localPoint(wall, frame, x, span.topA, half),
            localPoint(wall, frame, x, span.topA, -half),
          ], normal,
          [[0, span.bottom], [wall.thickness, span.bottom], [wall.thickness, span.topA], [0, span.topA]],
        );
      } else {
        addQuad(builder,
          [
            localPoint(wall, frame, x, span.bottom, half),
            localPoint(wall, frame, x, span.bottom, -half),
            localPoint(wall, frame, x, span.topA, -half),
            localPoint(wall, frame, x, span.topA, half),
          ], normal,
          [[0, span.bottom], [wall.thickness, span.bottom], [wall.thickness, span.topA], [0, span.topA]],
        );
      }
    }
  }

  for (const opening of openings) {
    const jambTop = opening.y1;
    if (opening.x0 > EPSILON) {
      addQuad(builder,
        [
          localPoint(wall, frame, opening.x0, opening.y0, half),
          localPoint(wall, frame, opening.x0, opening.y0, -half),
          localPoint(wall, frame, opening.x0, jambTop, -half),
          localPoint(wall, frame, opening.x0, jambTop, half),
        ], localNormal(frame, 1, 0, 0),
        [[0, opening.y0], [wall.thickness, opening.y0], [wall.thickness, jambTop], [0, jambTop]],
      );
    }
    if (opening.x1 < length - EPSILON) {
      addQuad(builder,
        [
          localPoint(wall, frame, opening.x1, opening.y0, -half),
          localPoint(wall, frame, opening.x1, opening.y0, half),
          localPoint(wall, frame, opening.x1, jambTop, half),
          localPoint(wall, frame, opening.x1, jambTop, -half),
        ], localNormal(frame, -1, 0, 0),
        [[0, opening.y0], [wall.thickness, opening.y0], [wall.thickness, jambTop], [0, jambTop]],
      );
    }
    if (opening.y0 > EPSILON) {
      addQuad(builder,
        [
          localPoint(wall, frame, opening.x0, opening.y0, -half),
          localPoint(wall, frame, opening.x0, opening.y0, half),
          localPoint(wall, frame, opening.x1, opening.y0, half),
          localPoint(wall, frame, opening.x1, opening.y0, -half),
        ], upNormal,
        [[opening.x0, 0], [opening.x0, wall.thickness], [opening.x1, wall.thickness], [opening.x1, 0]],
      );
    }
    const maxTop = Math.max(wallHeightAt(wall, frame, opening.x0), wallHeightAt(wall, frame, opening.x1));
    if (opening.y1 < maxTop - EPSILON) {
      addQuad(builder,
        [
          localPoint(wall, frame, opening.x0, opening.y1, -half),
          localPoint(wall, frame, opening.x1, opening.y1, -half),
          localPoint(wall, frame, opening.x1, opening.y1, half),
          localPoint(wall, frame, opening.x0, opening.y1, half),
        ], downNormal,
        [[opening.x0, 0], [opening.x1, 0], [opening.x1, wall.thickness], [opening.x0, wall.thickness]],
      );
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

  for (const entity of scene.entities) {
    if (entity.kind !== 'wall') continue;
    const floorElevation = floorElevations.get(entity.floorId);
    if (floorElevation === undefined) {
      diagnostics.push({ code: 'degenerate-wall', entityId: entity.id, message: `Wall ${entity.id} references missing floor ${entity.floorId}.` });
      continue;
    }
    const primitive = compileStraightWall(scene, entity, floorElevation, diagnostics);
    if (primitive) primitives.push(primitive);
  }

  return { units: 'metres', coordinates: scene.coordinates, primitives, diagnostics };
}
