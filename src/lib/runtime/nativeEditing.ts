import type { DoorLeafConfiguration, Project, Window } from '../models/types';
import { applyFurnitureLayoutCommand, type FurnitureLayoutCommand } from './furnitureLayout';
import { readProject } from '../utils/projectValidation';
import { doorLeafPresets, slidingDoorPreset } from '../utils/doorLeaves';
import { applyArchitectureEditCommand, type ArchitectureEditCommand } from './architectureEditing';

export type NativeEditCommand = FurnitureLayoutCommand | ArchitectureEditCommand |
  { type: 'window-style'; floorId: string; id: string; windowType: Window['type'] } |
  { type: 'door-leaves'; floorId: string; id: string; configuration: DoorLeafConfiguration | null } |
  { type: 'door-material'; floorId: string; id: string; material: 'wood' | 'glass' | 'steel' };

/** One candidate boundary for the offline desktop editor; the caller compiles
 * and stages it before accepting. Furniture edits keep their narrow contract. */
export function applyNativeEditCommand(input: unknown, command: NativeEditCommand, now = new Date()) {
  if (command.type === 'window-style') {
    const project=readProject(input), window=project.floors.find(f=>f.id===command.floorId)?.windows.find(w=>w.id===command.id);
    if(!window || !['standard','fixed','casement','sliding','bay'].includes(command.windowType)) throw new Error('Choose an existing window and its type.');
    window.type=command.windowType;project.updatedAt=now;
    return {project:readProject(project),selectedId:window.id,updateKind:'window-style' as const};
  }
  if (['floor-area-add','floor-area-update','floor-area-remove','wall-add','wall-update','wall-remove','wall-split','opening-add','opening-update','opening-remove','set-entrance','resolve-architecture-issue'].includes(command.type)) return applyArchitectureEditCommand(input, command as ArchitectureEditCommand, now);
  if (command.type === 'door-material') {
    const project = readProject(input), door = project.floors.find(f => f.id === command.floorId)?.doors.find(d => d.id === command.id);
    if (!door || door.type === 'opening' || !['wood','glass','steel'].includes(command.material)) throw new Error('Choose a door and its surface material.');
    door.material = command.material; project.updatedAt = now;
    return { project: readProject(project), selectedId: door.id, updateKind: 'door-material' as const };
  }
  if (command.type !== 'door-leaves') return { ...applyFurnitureLayoutCommand(input,command as FurnitureLayoutCommand,now), updateKind: 'furniture' as const };
  const project = readProject(input);
  const door = project.floors.find(f => f.id === command.floorId)?.doors.find(d => d.id === command.id);
  if (!door) throw new Error('Choose an existing door on this floor.');
  if(!['double','french','sliding','pocket'].includes(door.type))throw new Error('Panel settings require a sliding, pocket, double or French door.');
  if (command.configuration === null) delete door.leafConfiguration;
  else door.leafConfiguration = structuredClone(command.configuration);
  project.updatedAt = now;
  return { project: readProject(project), selectedId: null, updateKind: 'doors' as const };
}

export function nativeDoorAppearances(project: Project) {
  return project.floors.flatMap(f => f.doors.filter(d => d.type !== 'opening').map(d => ({ id: d.id, floorId: f.id, material: d.material ?? 'wood' })));
}

/** Read-only authoring projection, never added to the runtime schema. */
export function nativeDoorEditor(project: Project) {
  return project.floors.flatMap(floor => floor.doors.filter(door => ['double','french','sliding','pocket'].includes(door.type)).map(door => ({
    id: door.id, floorId: floor.id, type: door.type, width: door.width,
    configuration: door.leafConfiguration ?? null,
    presets: ['sliding','pocket'].includes(door.type) ? doorLeafPresets.filter(p => door.type === 'pocket' ? p.id === 'pocket' : p.id !== 'pocket').map(p => ({ label: p.label, configuration: slidingDoorPreset(door.width,p.id) })) : [],
  })));
}
