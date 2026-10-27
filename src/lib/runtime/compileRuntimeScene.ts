import type { Floor, Point, Project, Wall } from '$lib/models/types';
import { getWallEndHeight, getWallStartHeight } from '$lib/models/types';
import { floorInteriorPoint } from '$lib/utils/floorInteriorPoint';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { floorElevations } from '$lib/utils/floors';
import { needsWallMount, validateWallPlacement } from '../utils/furniturePlacement';
import { ceilingLightProfile, furnitureCeilingFrame, nativeRoomId, nativeCeilingHeight, needsCeilingMount, lightColor } from '../utils/ceilingFurniture';
import { getCatalogItem, getFurnitureSize } from '$lib/utils/furnitureCatalog';
import { wallProfileSpans } from '$lib/utils/wallProfiles';
import { wallPointAt, wallTangentAt } from '$lib/utils/wallPath';
import { triangulatePolygonWithHoles } from './polygonTriangulation';
import { entranceSpawn } from './playerSpawn';
import { compileRuntimeStair, type RuntimeStairTarget } from './stairTraversal';
import { compileRuntimeDoor } from './doorCompilation';
import {runtimeWallMovement} from './furnitureMovement';
import {hasBuiltinWallDecor} from '../utils/builtinWallDecor';
import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeBoxCollider,
  RuntimeCollider,
  RuntimeWallEntity,
  RuntimeEntity,
  RuntimeFloor,
  RuntimeRoomSurface,
  RuntimeTriangleMeshCollider,
  RuntimeVec2,
  RuntimeVec3,
} from './types';

const METRES_PER_CM = 0.01;
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

function compileRoomFloorCollider(room: RuntimeRoomSurface, floorId: string, elevation: number): RuntimeTriangleMeshCollider {
  const triangulated = triangulatePolygonWithHoles(room.polygon, room.holes);
  if (!triangulated || triangulated.vertices.length < 3 || triangulated.triangles.length === 0) {
    throw new Error(`Cannot compile runtime floor "${floorId}" room "${room.id}": native surface cannot be triangulated into floor collision. Correct its boundary/holes in the native Project.`);
  }

  // Runtime coordinates map the 2D plan's Y axis to +Z. A conventional CCW
  // plan triangle therefore points toward -Y after projection into X/Y/Z.
  // Reverse each triangle once here so one-sided physics backends receive a
  // canonical +Y walkable surface without guessing or enabling backface hits.
  const indices = triangulated.triangles.flatMap(([a, b, c]) => [a, c, b]);

  return {
    id: `floor:${room.id}`,
    ownerId: room.id,
    floorId,
    dynamic: false,
    kind: 'triangle-mesh',
    vertices: triangulated.vertices.map(([x, z]): RuntimeVec3 => [x, elevation, z]),
    indices,
  };
}

interface AdjacentFloors {
  above: RuntimeStairTarget | null;
  below: RuntimeStairTarget | null;
}

function compileFloor(
  floor: Floor,
  elevationCm: number,
  adjacentFloors: AdjacentFloors,
  customModels: Project['customModels'],
): { floor: RuntimeFloor; entities: RuntimeEntity[]; colliders: RuntimeCollider[] } {
  const analysis = analyzeFloor(floor);
  // Invalid explicit boundaries remain editable in the native Project. Export
  // must reject them, including apertures that would otherwise be omitted and
  // silently filled by a parent floor. Keep native topology and source intact.
  for (const { room, polygon } of analysis.geometry) {
    if (room.boundary && polygon.length < 3) {
      throw new Error(`Cannot compile runtime floor "${floor.id}" room "${room.id}": invalid or unresolved native boundary. Correct it in the native Project.`);
    }
  }
  const entities: RuntimeEntity[] = [];
  const colliders: RuntimeCollider[] = [];

  const walls = new Map<string, RuntimeWallEntity>();
  for (const wall of floor.walls) {
    const entity: RuntimeWallEntity = {
      id: wall.id, floorId: floor.id, kind: 'wall',
      path: { start: point2(wall.start), end: point2(wall.end), ...(wall.curvePoint ? { control: point2(wall.curvePoint) } : {}) },
      thickness: m(wall.thickness),
      startHeight: m(getWallStartHeight(wall)),
      endHeight: m(getWallEndHeight(wall)),
      boundaryType: wall.boundaryType ?? 'solid',
      visible: wall.boundaryType !== 'air',
    };
    walls.set(wall.id, entity);
    entities.push(entity);
    colliders.push(...compileWallColliders(floor, elevationCm, wall));
  }

  for (const door of floor.doors) {
    const wall = walls.get(door.wallId);
    if (!wall) continue;
    const result = compileRuntimeDoor(floor.id, m(elevationCm), door, wall);
    entities.push(result.entity);
    colliders.push(...result.colliders);
  }

  for (const win of floor.windows) {
    const wall = floor.walls.find(wall => wall.id === win.wallId);
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
    if (catalog?.symbol && !item.customModelId) continue;
    const custom = customModels?.find(model => model.id === item.customModelId);
    const size = getFurnitureSize({ ...item, width: item.width ?? custom?.width, depth: item.depth ?? custom?.depth, height: item.height ?? custom?.height });
    const ceiling = needsCeilingMount(item.catalogId) ? furnitureCeilingFrame(floor,item,analysis) : null;
    if (!ceiling && item.ceilingMount) throw new Error('Ceiling attachment requires a ceiling furniture asset.');
    if (!ceiling && item.light) throw new Error('Light settings require a supported attached ceiling light.');
    const position = point3(item.position, elevationCm + (ceiling?.bottom ?? item.wallMount?.elevation ?? 0) + size.height / 2);
    const yaw = item.rotation * Math.PI / 180;
    const frame = item.wallMount ? validateWallPlacement(floor, { ...item, width: item.width ?? custom?.width, depth: item.depth ?? custom?.depth, height: item.height ?? custom?.height }) : null;
    entities.push({
      locked: !!item.locked,
      movement: ceiling ? { kind: 'ceiling', roomId: ceiling.id, elevation: m(elevationCm+ceiling.height) } : frame ? runtimeWallMovement(frame,item.wallMount!,elevationCm)
        : needsWallMount(item.catalogId) ? { kind: 'unbound-wall' } : { kind: 'floor', elevation: m(elevationCm) },
      id: item.id, floorId: floor.id, kind: 'furniture', catalogId: item.catalogId,
      ...(item.sourceCategory ? { sourceCategory: item.sourceCategory } : {}),
      assetRef: item.customModelId ? `custom-model:${item.customModelId}` : ceiling || hasBuiltinWallDecor(item.catalogId) ? `builtin:${item.catalogId}-v1` : `catalog:${item.catalogId}`,
      ...(ceiling ? { light: (() => {
        const profile = ceilingLightProfile(item.catalogId)!;
        const settings = item.light ?? profile.defaults;
        return { ...settings, kind: profile.kind, color: lightColor(settings.temperatureKelvin), range: profile.range,
          spotAngleDegrees: profile.spotAngleDegrees, localPosition: [0,-m(size.height/2)-.015,0] as RuntimeVec3, direction:[0,-1,0] as RuntimeVec3 };
      })() } : {}),
      mirror: [(item.scale?.x ?? 1) < 0 ? -1 : 1, 1, (item.scale?.y ?? 1) < 0 ? -1 : 1],
      position, yawClockwiseRadians: yaw, size: [m(size.width), m(size.height), m(size.depth)],
    });
    // Source semantic markers remain selectable authoring anchors. Their
    // arbitrary fallback block dimensions must not become walking obstacles.
    const semanticMarker = item.catalogId === 'imported_object' && item.renderStyle === 'block' && !item.customModelId;
    if (!semanticMarker && size.width > 0 && size.depth > 0 && (ceiling || size.height >= 20)) {
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
    const target = stair.direction === 'up' ? adjacentFloors.above : adjacentFloors.below;
    const result = compileRuntimeStair(floor, elevationCm, stair, target);
    entities.push(result.entity);
    if (result.collider) colliders.push(result.collider);
  }

  const elevation = m(elevationCm);
  // Explicit floorOpening rooms participate in nesting so parent room holes are
  // preserved, but they are apertures rather than surfaces of their own. Do not
  // emit a second floor/ceiling primitive that would fill the opening again.
  const rooms: RuntimeRoomSurface[] = analysis.geometry
    .filter(({ room }) => !room.floorOpening)
    .map(({ room, polygon }) => ({
      // Saved native room identity is authoritative. Unpersisted detected rooms
      // carry editor timestamps; derive their runtime identity from floor/boundary.
      id: nativeRoomId(floor,room),
      name: room.name,
      roomType: room.roomType ?? 'indoor',
      polygon: polygon.map(point2),
      holes: (analysis.holes.get(room.id) ?? []).map(hole => hole.map(point2)),
      slabThickness: m(floor.slabThickness ?? 5),
      ...(nativeCeilingHeight(floor,room) === undefined ? {} : { ceilingWallIds: [...new Set(room.walls)].sort() }),
      ceilingHeight: (() => {
        const height = nativeCeilingHeight(floor,room);
        return height === undefined ? null : m(height);
      })(),
    }));
  for (const room of rooms) {
    colliders.push(compileRoomFloorCollider(room, floor.id, elevation));
  }

  return {
    floor: {
      id: floor.id, name: floor.name, level: floor.level, elevation,
      walkthroughStart: floor.walkthroughStart ? point3(floor.walkthroughStart, elevationCm) :
        rooms.length ? point3(floorInteriorPoint(analysis), elevationCm) : null,
      rooms,
      ...entranceSpawn(floor, entities, elevation),
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
  const entries = floorElevations(project.floors);
  for (let index = 0; index < entries.length; index += 1) {
    const { floor, elevation } = entries[index];
    const compiled = compileFloor(floor, elevation, {
      below: index > 0 ? { floorId: entries[index - 1].floor.id, elevationCm: entries[index - 1].elevation } : null,
      above: index + 1 < entries.length ? { floorId: entries[index + 1].floor.id, elevationCm: entries[index + 1].elevation } : null,
    }, project.customModels);
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
