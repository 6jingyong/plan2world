import type { BackgroundImage, Project, Wall } from '$lib/models/types';
import { draftToProject } from './draft';

export interface SourceFloorPlanImage {
  dataUrl: string;
  width: number;
  height: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function wallBounds(walls: Wall[]): Bounds | null {
  if (!walls.length) return null;
  const xs = walls.flatMap(wall => [wall.start.x, wall.end.x]);
  const ys = walls.flatMap(wall => [wall.start.y, wall.end.y]);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Fit the source raster around reconstructed wall bounds without stretching it.
 * The existing editor background controls remain authoritative for fine alignment
 * and two-point calibration after import.
 */
export function sourceBackgroundForWalls(
  walls: Wall[],
  source: SourceFloorPlanImage,
  opacity = 0.35,
): BackgroundImage | undefined {
  const bounds = wallBounds(walls);
  if (!bounds) return undefined;
  if (typeof source.dataUrl !== 'string' || !source.dataUrl.startsWith('data:image/')) {
    throw new Error('Source floor-plan image must be an image data URL.');
  }
  const width = positiveFinite(source.width, 'Source image width');
  const height = positiveFinite(source.height, 'Source image height');
  const planWidth = bounds.maxX - bounds.minX;
  const planDepth = bounds.maxY - bounds.minY;

  // Cover the reconstructed wall extent while preserving the source image aspect ratio.
  // This is only an initial registration because screenshots often include margins.
  const scale = Math.max(planWidth / width, planDepth / height);

  return {
    dataUrl: source.dataUrl,
    position: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    scale,
    opacity: Math.max(0, Math.min(1, opacity)),
    rotation: 0,
    locked: true,
  };
}

export function draftToProjectWithSourceBackground(
  draft: unknown,
  source: SourceFloorPlanImage,
  now = new Date(),
): Project {
  const project = draftToProject(draft, now);
  const floor = project.floors[0];
  if (!floor) return project;
  const backgroundImage = sourceBackgroundForWalls(floor.walls, source);
  if (backgroundImage) floor.backgroundImage = backgroundImage;
  return project;
}
