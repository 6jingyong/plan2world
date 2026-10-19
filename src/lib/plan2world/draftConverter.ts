import type { Door, Floor, FurnitureItem, Project, Room, Wall, Window } from '$lib/models/types';
import { resolveRooms } from '$lib/utils/roomDetection';
import {
  PLAN2WORLD_DRAFT_VERSION,
  Plan2WorldDraftError,
  parsePlan2WorldDraft,
  type DraftFloor,
  type DraftWall,
  type Plan2WorldDraft,
} from './draftContract';

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

function wallSetKey(wallIds: readonly string[]): string {
  return JSON.stringify([...wallIds].sort());
}

function applyFloorOpenings(draft: DraftFloor, rooms: Room[]): Map<string, Room> {
  const replacements = new Map<string, Room>();
  for (const opening of draft.floorOpenings ?? []) {
    const target = wallSetKey(opening.wallIds);
    const matches = rooms.filter(room => !room.boundary && wallSetKey(room.walls) === target);
    if (matches.length !== 1) {
      throw new Plan2WorldDraftError(
        `Floor ${draft.id}: floor opening ${opening.id} must match exactly one enclosed wall-derived room; found ${matches.length}`,
      );
    }
    const room = matches[0];
    if (replacements.has(room.id)) {
      throw new Plan2WorldDraftError(`Floor ${draft.id}: multiple floor openings target the same enclosed room`);
    }
    replacements.set(room.id, {
      ...room,
      id: opening.id,
      name: opening.name,
      floorOpening: true,
      area: 0,
    });
  }
  return replacements;
}

function toFloor(draft: DraftFloor, presentation: Plan2WorldDraft['presentation'] | undefined, roomIdSeed: string): Floor {
  const walls: Wall[] = draft.walls.map(wall => ({
    id: wall.id,
    start: { ...wall.start },
    end: { ...wall.end },
    curvePoint: wall.curvePoint ? { ...wall.curvePoint } : undefined,
    thickness: wallThickness(wall),
    height: wall.height ?? DEFAULTS.wallHeight,
    color: '#eeeeee',
  }));

  const doors: Door[] = (draft.doors ?? []).map(door => ({
    id: door.id,
    wallId: door.wallId,
    position: door.position,
    width: door.width,
    height: door.height ?? DEFAULTS.doorHeight,
    type: door.type ?? 'single',
    swingDirection: door.swingDirection ?? 'left',
    flipSide: door.flipSide ?? false,
  }));

  const windows: Window[] = (draft.windows ?? []).map(window => ({
    id: window.id,
    wallId: window.wallId,
    position: window.position,
    width: window.width,
    height: window.height ?? (presentation ? Math.max(1, walls.find(wall => wall.id === window.wallId)!.height - (window.sillHeight ?? 0)) : DEFAULTS.windowHeight),
    sillHeight: window.sillHeight ?? (presentation ? 0 : DEFAULTS.windowSillHeight),
    type: window.type ?? (presentation ? 'fixed' : 'standard'),
  }));

  const furniture: FurnitureItem[] = (draft.furniture ?? []).map(item => ({
    id: item.id,
    catalogId: item.catalogId,
    position: { ...item.position },
    rotation: item.rotation ?? 0,
    scale: { x: 1, y: 1, z: 1 },
    ...(presentation ? { renderStyle: 'block' as const } : {}),
    ...(item.sourceCategory !== undefined ? { sourceCategory: item.sourceCategory } : {}),
    ...(item.width !== undefined ? { width: item.width } : {}),
    ...(item.depth !== undefined ? { depth: item.depth } : {}),
    ...(item.height !== undefined ? { height: item.height } : {}),
  }));

  const floor: Floor = {
    id: draft.id,
    name: draft.name,
    level: draft.level,
    elevation: draft.elevation,
    walls,
    rooms: (draft.floorAreas ?? []).map(area => ({ id: area.id, name: area.name,
      boundary: structuredClone(area.boundary), walls: [], roomType: 'outdoor', floorTexture: 'concrete', area: 0 })),
    doors,
    windows,
    furniture,
    stairs: [],
    columns: [],
    guides: [],
    measurements: [],
    annotations: [],
    textAnnotations: [],
    groups: [],
  };

  const resolvedRooms = resolveRooms(floor);
  const floorOpeningRooms = applyFloorOpenings(draft, resolvedRooms);

  // resolveRooms intentionally uses wall-clock IDs for newly detected rooms in the
  // interactive editor. At this conversion boundary we replace only those transient
  // IDs so the same validated draft + conversion seed produces the same native artifact.
  // Authored floor-opening IDs are already stable and must survive this normalization.
  let detectedRoomIndex = 0;
  floor.rooms = resolvedRooms.map(room => {
    if (room.boundary) return room;
    const opening = floorOpeningRooms.get(room.id);
    if (opening) return opening;
    return {
      ...room,
      id: `plan2world-room-${draft.id}-${++detectedRoomIndex}-${roomIdSeed}`,
    };
  });
  return floor;
}

/**
 * Convert an already validated Plan2World draft into the native editable Project model.
 * This boundary deliberately performs no source interpretation or semantic repair.
 */
export function validatedDraftToProject(draft: Plan2WorldDraft, now = new Date()): Project {
  const roomIdSeed = now.getTime().toString(36);
  const floors = draft.floors.map(floor => toFloor(floor, draft.presentation, roomIdSeed));
  const scaleDescription = `Scale: ${draft.scale.mode} (${Math.round(draft.scale.confidence * 100)}% confidence)${draft.scale.basis ? ` — ${draft.scale.basis}` : ''}.`;
  const assumptions = draft.assumptions?.length ? ` Assumptions: ${draft.assumptions.join(' | ')}` : '';

  return {
    id: `plan2world-${roomIdSeed}`,
    name: draft.name,
    reconstruction: {
      version: 1,
      scale: { ...draft.scale },
      assumptions: [...(draft.assumptions ?? [])],
      floors: draft.floors.map(floor => ({
        floorId: floor.id,
        walls: floor.walls.map(({ id, kind, confidence }) => ({ id, kind, confidence })),
        doors: (floor.doors ?? []).map(({ id, confidence }) => ({ id, confidence })),
        windows: (floor.windows ?? []).map(({ id, confidence }) => ({ id, confidence })),
        ...(floor.floorAreas?.length ? { floorAreas: floor.floorAreas.map(({ id, confidence }) => ({ id, confidence })) } : {}),
        ...(floor.floorOpenings?.length ? { floorOpenings: floor.floorOpenings.map(({ id, confidence }) => ({ id, confidence })) } : {}),
      })),
    },
    description: `Imported from ${PLAN2WORLD_DRAFT_VERSION}. ${scaleDescription}${assumptions}`,
    floors,
    activeFloorId: floors[0].id,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

/** Backwards-compatible convenience entry point: validate first, then convert. */
export function draftToProject(input: unknown, now = new Date()): Project {
  return validatedDraftToProject(parsePlan2WorldDraft(input), now);
}
