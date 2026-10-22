import type { Door, Floor, Point, Project, Wall } from '$lib/models/types';
import { getWallEndHeight, getWallStartHeight } from '$lib/models/types';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { floorElevations } from '$lib/utils/floors';
import { getCatalogItem, getFurnitureSize } from '$lib/utils/furnitureCatalog';
import { roomCeilingHeight, wallProfileSpans } from '$lib/utils/wallProfiles';
import { wallPointAt, wallTangentAt } from '$lib/utils/wallPath';
import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeBoxCollider,
  RuntimeCollider,
  RuntimeDoorEntity,
  RuntimeDoorInteraction,
  RuntimeEntity,
  RuntimeFloor,
  RuntimeVec2,
  RuntimeVec3,
} from './types';

const METRES_PER_CM = 0.01;
const DOOR_LEAF_THICKNESS_CM = 4;
const DEFAULT_PLAYER = {
  eyeHeight: 1.6,
  radius: 0.28,
  speeds: { slow: 0.6, walk: 1.2, fast: 2.4 },
} as const;

const m = (cm: number) => cm * METRES_PER_CM;
const point2 = (p: Point): RuntimeVec2 => [m(p.x), m(p.y)];
const point3 = (p: Point, yCm: number): RuntimeVec3 => [m(p.x), m(yCm), m(p.y)];
const yawForWall = (wall: Pick<Wall, 'start' | 'end' | 'curvePoint'>, position: number) => {
  const tangent = wallTangentAt(wall, position);
  return Math.atan2(tangent.y, tangent.x);
};

function compileDoorInteraction(door: Door, tangent: Point, hingePoint: Point, elevationCm: number): RuntimeDoorInteraction {
  switch (door.type) {
    case 'opening':
      return { kind: 'none' };
    case 'sliding':
    case 'pocket': {
      const travelSign = door.swingDirection === 'left' ? 1 : -1;
      return {
        kind: 'slide',
        axis: [tangent.x * travelSign, 0, tangent.y * travelSign],
        travel: m(door.width),
      };
    }
    case 'bifold':
      return { kind: 'unsupported', sourceMotion: 'fold' };
    case 'garage':
      return { kind: 'unsupported', sourceMotion: 'overhead' };
    default: {
      const hingeSign = door.swingDirection === 'left' ? 1 : -1;
      const sideSign = door.flipSide ? -1 : 1;
      return {
        kind: 'swing',
        pivot: point3(hingePoint, elevationCm),
        axis: [0, 1, 0],
        openAngleRadians: hingeSign * sideSign * Math.PI / 2,
      };
    }
  }
}

function compileWallColliders(floor: Floor, elevationCm: number, wall: Wall): RuntimeBoxCollider[] {
  const doors = floor.doors.filter(door => door.wallId === wall.id);
  // Windows never create walk-through gaps. Door openings are removed from the
  // static wall collision and get their own dynamic leaf collider below.
  return wallProfileSpans(wall, doors, []).flatMap((span, spanIndex) => {
    if (span.length <= 0) return [];
    const dx = span.end.x - span.start.x;
    const dz = span.end.y - span.start.y;
    const yaw = Math.atan2(dz, dx);
    return span.segments.flatMap((segment, segmentIndex) => {
      if (segment.bottomY > 1e-6) return [];
      const heightCm = Math.min(segment.topYLeft, segment.topYRight) - segment.bottomY;
      if (!(heightCm > 0) || !(segment.width > 0)) return [];
      const t = segment.offsetX / span.length;
      const center: RuntimeVec3 = [
        m(span.start.x + dx * t),
        m(elevationCm + segment.bottomY + heightCm / 2),
        m(span.start.y + dz * t),
      ];
      return [{
        id: `wall:${wall.id}:${spanIndex}:${segmentIndex}`,
        ownerId: wall.id,
        floorId: floor.id,
        dynamic: false,
        kind: 'box' as const,
        center,
        size: [m(segment.width), m(heightCm), m(Math.max(1, wall.thickness))],
        yawClockwiseRadians: yaw,
      }];
    });
  });
}

function compileDoor(floor: Floor, elevationCm: number, door: Door, wall: Wall): {
  entity: RuntimeDoorEntity;
  collider?: RuntimeBoxCollider;
} {
  const centerPoint = wallPointAt(wall, door.position);
  const tangent = wallTangentAt(wall, door.position);
  const yaw = Math.atan2(tangent.y, tangent.x);
  const hingeSign = door.swingDirection === 'left' ? 1 : -1;
  const hingePoint = {
    x: centerPoint.x + tangent.x * hingeSign * door.width / 2,
    y: centerPoint.y + tangent.y * hingeSign * door.width / 2,
  };
  const entity: RuntimeDoorEntity = {
    id: door.id,
    floorId: floor.id,
    kind: 'door',
    hostWallId: wall.id,
    pathPosition: door.position,
    width: m(door.width),
    height: m(door.height),
    doorType: door.type,
    swingDirection: door.swingDirection,
    flipSide: door.flipSide,
    closedPose: { center: point3(centerPoint, elevationCm + door.height / 2), yawClockwiseRadians: yaw },
    interaction: compileDoorInteraction(door, tangent, hingePoint, elevationCm),
  };
  if (door.type === 'opening') return { entity };
  return {
    entity,
    collider: {
      id: `door:${door.id}:leaf`, ownerId: door.id, floorId: floor.id, dynamic: true, kind: 'box',
      center: entity.closedPose.center,
      size: [m(door.width), m(door.height), m(DOOR_LEAF_THICKNESS_CM)],
      yawClockwiseRadians: yaw,
    },
  };
}

function compileFloor(floor: Floor, elevationCm: number): { floor: RuntimeFloor; entities: RuntimeEntity[]; colliders: RuntimeCollider[] } {
  const analysis = analyzeFloor(floor);
  const entities: RuntimeEntity[] = [];
  const colliders: RuntimeCollider[] = [];

  for (const wall of floor.walls) {
    entities.push({
      id: wall.id, floorId: floor.id, kind: 'wall',
      path: { start: point2(wall.start), end: point2(wall.end), ...(wall.curvePoint ? { control: point2(wall.curvePoint) } : {}) },
      thickness: m(wall.thickness),
      startHeight: m(getWallStartHeight(wall)),
      endHeight: m(getWallEndHeight(wall)),
      boundaryType: wall.boundaryType ?? 'solid',
      visible: wall.boundaryType !== 'air',
    });
    colliders.push(...compileWallColliders(floor, elevationCm, wall));
  }

  const walls = new Map(floor.walls.map(wall => [wall.id, wall]));
  for (const door of floor.doors) {
    const wall = walls.get(door.wallId);
    if (!wall) continue;
    const result = compileDoor(floor, elevationCm, door, wall);
    entities.push(result.entity);
    if (result.collider) colliders.push(result.collider);
  }

  for (const win of floor.windows) {
    const wall = walls.get(win.wallId);
    if (!wall) continue;
    const centerPoint = wallPointAt(wall, win.position);
    entities.push({
      id: win.id, floorId: floor.id, kind: 'window', hostWallId: wall.id, pathPosition: win.position,
      width: m(win.width), height: m(win.height), sillHeight: m(win.sillHeight), windowType: win.type,
      center: point3(centerPoint, elevationCm + win.sillHeight + win.height / 2),
      yawClockwiseRadians: yawForWall(wall, win.position),
    });
  }

  for (const item of floor.furniture) {
    const catalog = getCatalogItem(item.catalogId);
    if (catalog?.symbol) continue;
    const size = getFurnitureSize(item);
    const position = point3(item.position, elevationCm + size.height / 2);
    const yaw = item.rotation * Math.PI / 180;
    entities.push({
      id: item.id, floorId: floor.id, kind: 'furniture', catalogId: item.catalogId,
      ...(item.sourceCategory ? { sourceCategory: item.sourceCategory } : {}),
      assetRef: item.customModelId ? `custom-model:${item.customModelId}` : `catalog:${item.catalogId}`,
      position, yawClockwiseRadians: yaw, size: [m(size.width), m(size.height), m(size.depth)],
    });
    if (size.width > 0 && size.depth > 0 && size.height >= 20) {
      colliders.push({
        id: `furniture:${item.id}`, ownerId: item.id, floorId: floor.id, dynamic: false, kind: 'box',
        center: position, size: [m(size.width), m(size.height), m(size.depth)], yawClockwiseRadians: yaw,
      });
    }
  }

  for (const column of floor.columns) {
    const center = point3(column.position, elevationCm + column.height / 2);
    const yaw = column.rotation * Math.PI / 180;
    entities.push({
      id: column.id, floorId: floor.id, kind: 'column', shape: column.shape,
      position: center, yawClockwiseRadians: yaw, diameter: m(column.diameter), height: m(column.height),
    });
    colliders.push(column.shape === 'round' ? {
      id: `column:${column.id}`, ownerId: column.id, floorId: floor.id, dynamic: false, kind: 'cylinder',
      center, radius: m(column.diameter / 2), height: m(column.height),
    } : {
      id: `column:${column.id}`, ownerId: column.id, floorId: floor.id, dynamic: false, kind: 'box',
      center, size: [m(column.diameter), m(column.height), m(column.diameter)], yawClockwiseRadians: yaw,
    });
  }

  for (const stair of floor.stairs) {
    entities.push({
      id: stair.id, floorId: floor.id, kind: 'stair', position: point3(stair.position, elevationCm),
      yawClockwiseRadians: stair.rotation * Math.PI / 180,
      width: m(stair.width), depth: m(stair.depth), riserCount: stair.riserCount,
      direction: stair.direction, stairType: stair.stairType,
    });
  }

  const rooms = analysis.geometry.map(({ room, polygon }) => ({
    id: room.id,
    name: room.name,
    roomType: room.roomType ?? 'indoor',
    polygon: polygon.map(point2),
    holes: (analysis.holes.get(room.id) ?? []).map(hole => hole.map(point2)),
    slabThickness: m(floor.slabThickness ?? 5),
    ceilingHeight: (() => {
      const height = roomCeilingHeight(room.walls, floor.walls);
      return height === undefined ? null : m(height);
    })(),
  }));

  return {
    floor: {
      id: floor.id, name: floor.name, level: floor.level, elevation: m(elevationCm),
      walkthroughStart: floor.walkthroughStart ? point3(floor.walkthroughStart, elevationCm) : null,
      rooms,
    },
    entities,
    colliders,
  };
}

/** Compile the editable native Project into an engine-neutral runtime snapshot.
 * The result contains no Three.js/Godot/Unity/Unreal types and never mutates Project.
 */
export function compileRuntimeScene(project: Project): Plan2WorldRuntimeSceneV1 {
  const floors: RuntimeFloor[] = [];
  const entities: RuntimeEntity[] = [];
  const colliders: RuntimeCollider[] = [];
  for (const { floor, elevation } of floorElevations(project.floors)) {
    const compiled = compileFloor(floor, elevation);
    floors.push(compiled.floor);
    entities.push(...compiled.entities);
    colliders.push(...compiled.colliders);
  }
  return {
    schema: 'plan2world-runtime-v1', version: 1, units: 'metres',
    coordinates: { handedness: 'right', up: '+Y', planX: '+X', planY: '+Z', yaw: 'clockwise-from-+X' },
    source: { projectId: project.id, projectName: project.name },
    playerProfile: { eyeHeight: DEFAULT_PLAYER.eyeHeight, radius: DEFAULT_PLAYER.radius, speeds: { ...DEFAULT_PLAYER.speeds } },
    floors, entities, colliders,
  };
}
