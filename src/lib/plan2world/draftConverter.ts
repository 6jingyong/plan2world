import type { Door, Floor, FurnitureItem, Project, Wall, Window } from '$lib/models/types';
import { resolveRooms } from '$lib/utils/roomDetection';
import { PLAN2WORLD_DRAFT_VERSION, parsePlan2WorldDraft, type DraftFloor, type DraftWall, type Plan2WorldDraft } from './draftContract';

const DEFAULTS = {
  wallHeight: 280,
  interiorWallThickness: 12,
  exteriorWallThickness: 20,
  doorHeight: 210,
  windowHeight: 120,
  windowSillHeight: 90,
} as const;

function wallThickness(wall: DraftWall): number {
  if (wall.thickness !== undefined) return wall.thickness;
  return wall.kind === 'exterior' ? DEFAULTS.exteriorWallThickness : DEFAULTS.interiorWallThickness;
}

function toFloor(draft: DraftFloor, roomIdSeed: string): Floor {
  const walls: Wall[] = draft.walls.map(wall => ({
    id: wall.id, start: { ...wall.start }, end: { ...wall.end }, curvePoint: wall.curvePoint ? { ...wall.curvePoint } : undefined,
    thickness: wallThickness(wall), height: wall.height ?? DEFAULTS.wallHeight, color: '#eeeeee',
  }));
  const doors: Door[] = (draft.doors ?? []).map(door => ({
    id: door.id, wallId: door.wallId, position: door.position, width: door.width, height: door.height ?? DEFAULTS.doorHeight,
    type: door.type ?? 'single', swingDirection: door.swingDirection ?? 'left', flipSide: door.flipSide ?? false,
  }));
  const windows: Window[] = (draft.windows ?? []).map(window => ({
    id: window.id, wallId: window.wallId, position: window.position, width: window.width,
    height: window.height ?? DEFAULTS.windowHeight, sillHeight: window.sillHeight ?? DEFAULTS.windowSillHeight, type: window.type ?? 'standard',
  }));
  const furniture: FurnitureItem[] = (draft.furniture ?? []).map(item => ({
    id: item.id, catalogId: item.catalogId, position: { ...item.position }, rotation: item.rotation ?? 0, scale: { x: 1, y: 1, z: 1 },
    ...(item.catalogId === 'imported_object' ? { renderStyle: 'block' as const } : {}),
    ...(item.sourceCategory !== undefined ? { sourceCategory: item.sourceCategory } : {}),
    ...(item.width !== undefined ? { width: item.width } : {}), ...(item.depth !== undefined ? { depth: item.depth } : {}), ...(item.height !== undefined ? { height: item.height } : {}),
  }));

  const floor: Floor = {
    id: draft.id, name: draft.name, level: draft.level, elevation: draft.elevation, walls,
    rooms: (draft.floorAreas ?? []).map(area => ({ id: area.id, name: area.name, boundary: structuredClone(area.boundary), walls: [], roomType: 'outdoor', floorTexture: 'concrete', area: 0 })),
    doors, windows, furniture, stairs: [], columns: [], guides: [], measurements: [], annotations: [], textAnnotations: [], groups: [],
  };
  let detectedRoomIndex = 0;
  floor.rooms = resolveRooms(floor).map(room => room.boundary ? room : { ...room, id: `plan2world-room-${draft.id}-${++detectedRoomIndex}-${roomIdSeed}` });
  return floor;
}

export function validatedDraftToProject(draft: Plan2WorldDraft, now = new Date()): Project {
  const roomIdSeed = now.getTime().toString(36);
  const floors = draft.floors.map(floor => toFloor(floor, roomIdSeed));
  const scaleDescription = `Scale: ${draft.scale.mode} (${Math.round(draft.scale.confidence * 100)}% confidence)${draft.scale.basis ? ` — ${draft.scale.basis}` : ''}.`;
  const assumptions = draft.assumptions?.length ? ` Assumptions: ${draft.assumptions.join(' | ')}` : '';
  return {
    id: `plan2world-${roomIdSeed}`, name: draft.name,
    reconstruction: {
      version: 1, scale: { ...draft.scale }, assumptions: [...(draft.assumptions ?? [])],
      floors: draft.floors.map(floor => ({
        floorId: floor.id,
        walls: floor.walls.map(({ id, kind, confidence }) => ({ id, kind, confidence })),
        doors: (floor.doors ?? []).map(({ id, confidence }) => ({ id, confidence })),
        windows: (floor.windows ?? []).map(({ id, confidence }) => ({ id, confidence })),
        ...(floor.floorAreas?.length ? { floorAreas: floor.floorAreas.map(({ id, confidence }) => ({ id, confidence })) } : {}),
      })),
    },
    description: `Imported from ${PLAN2WORLD_DRAFT_VERSION}. ${scaleDescription}${assumptions}`,
    floors, activeFloorId: floors[0].id, createdAt: new Date(now), updatedAt: new Date(now),
  };
}

export function draftToProject(input: unknown, now = new Date()): Project {
  return validatedDraftToProject(parsePlan2WorldDraft(input), now);
}
