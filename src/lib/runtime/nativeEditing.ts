import type { DoorLeafConfiguration, Project } from '../models/types';
import { applyFurnitureLayoutCommand, type FurnitureLayoutCommand } from './furnitureLayout';
import { readProject } from '../utils/projectValidation';
import { doorLeafPresets, slidingDoorPreset } from '../utils/doorLeaves';

export type NativeEditCommand = FurnitureLayoutCommand |
  { type: 'door-leaves'; floorId: string; id: string; configuration: DoorLeafConfiguration | null };

/** One candidate boundary for the offline desktop editor; the caller compiles
 * and stages it before accepting. Furniture edits keep their narrow contract. */
export function applyNativeEditCommand(input: unknown, command: NativeEditCommand, now = new Date()) {
  if (command.type !== 'door-leaves') return { ...applyFurnitureLayoutCommand(input,command,now), updateKind: 'furniture' as const };
  const project = readProject(input);
  const door = project.floors.find(f => f.id === command.floorId)?.doors.find(d => d.id === command.id);
  if (!door) throw new Error('Choose an existing door on this floor.');
  if (command.configuration === null) delete door.leafConfiguration;
  else door.leafConfiguration = structuredClone(command.configuration);
  project.updatedAt = now;
  return { project: readProject(project), selectedId: null, updateKind: 'doors' as const };
}

/** Read-only authoring projection, never added to the runtime schema. */
export function nativeDoorEditor(project: Project) {
  return project.floors.flatMap(floor => floor.doors.filter(door => ['double','french','sliding','pocket'].includes(door.type)).map(door => ({
    id: door.id, floorId: floor.id, type: door.type, width: door.width,
    configuration: door.leafConfiguration ?? null,
    presets: ['sliding','pocket'].includes(door.type) ? doorLeafPresets.filter(p => door.type === 'pocket' ? p.id === 'pocket' : p.id !== 'pocket').map(p => ({ label: p.label, configuration: slidingDoorPreset(door.width,p.id) })) : [],
  })));
}
