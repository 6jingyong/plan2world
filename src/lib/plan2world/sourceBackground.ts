import type { BackgroundImage, Project, Wall } from '$lib/models/types';
import { wallPathSpans } from '$lib/utils/wallProfiles';
import {
  draftToProject,
  parsePlan2WorldDraft,
  type DraftPoint,
  type DraftSourceRegistration,
  type Plan2WorldDraft,
} from './draft';

export interface SourceFloorPlanImage {
  dataUrl: string;
  width: number;
  height: number;
  name?: string;
}

export interface NormalizedImagePoint {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Correspondence {
  image: DraftPoint;
  world: DraftPoint;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function normalizedPoint(value: NormalizedImagePoint, label: string): NormalizedImagePoint {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)
    || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) {
    throw new Error(`${label} must lie inside the source image.`);
  }
  return value;
}

function wallBounds(walls: Wall[]): Bounds | null {
  if (!walls.length) return null;
  const points = walls.flatMap(wall => wallPathSpans(wall).flatMap(span => [span.start, span.end]));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY };
}

export async function decodeSourceFloorPlanImage(dataUrl: string): Promise<SourceFloorPlanImage> {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('Source floor-plan image must be an image data URL.');
  }
  return await new Promise<SourceFloorPlanImage>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        reject(new Error('The source floor-plan image dimensions could not be read.'));
        return;
      }
      resolve({ dataUrl, width, height });
    };
    image.onerror = () => reject(new Error('The source floor-plan image could not be decoded.'));
    image.src = dataUrl;
  });
}

/** Fit a source raster around wall bounds without stretching it. Used only when no source registration exists. */
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

function resolveRegistrationAnchors(
  draft: Plan2WorldDraft,
  registration: DraftSourceRegistration,
  source: SourceFloorPlanImage,
): Correspondence[] {
  const floor = draft.floors.find(item => item.id === registration.floorId);
  if (!floor) return [];
  const width = positiveFinite(source.width, 'Source image width');
  const height = positiveFinite(source.height, 'Source image height');

  return registration.anchors.flatMap(anchor => {
    const wall = floor.walls.find(item => item.id === anchor.wallId);
    if (!wall) return [];
    const world = wall[anchor.endpoint];
    return [{
      image: { x: anchor.image.x * width - width / 2, y: anchor.image.y * height - height / 2 },
      world: { ...world },
    }];
  });
}

/** Solve a best-fit 2D similarity transform from source-image anchors to draft wall endpoints. */
function similarityBackground(
  correspondences: Correspondence[],
  source: SourceFloorPlanImage,
  opacity: number,
): BackgroundImage | undefined {
  if (correspondences.length < 2) return undefined;
  const n = correspondences.length;
  const imageMean = correspondences.reduce((sum, pair) => ({ x: sum.x + pair.image.x / n, y: sum.y + pair.image.y / n }), { x: 0, y: 0 });
  const worldMean = correspondences.reduce((sum, pair) => ({ x: sum.x + pair.world.x / n, y: sum.y + pair.world.y / n }), { x: 0, y: 0 });

  let denominator = 0;
  let dot = 0;
  let cross = 0;
  for (const pair of correspondences) {
    const px = pair.image.x - imageMean.x;
    const py = pair.image.y - imageMean.y;
    const qx = pair.world.x - worldMean.x;
    const qy = pair.world.y - worldMean.y;
    denominator += px * px + py * py;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
  }
  if (!Number.isFinite(denominator) || denominator <= 1e-9) return undefined;

  const a = dot / denominator;
  const b = cross / denominator;
  const scale = Math.hypot(a, b);
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  const rotationRadians = Math.atan2(b, a);
  const position = {
    x: worldMean.x - (a * imageMean.x - b * imageMean.y),
    y: worldMean.y - (b * imageMean.x + a * imageMean.y),
  };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return undefined;

  if (correspondences.length >= 3) {
    let squaredError = 0;
    let maxWorldSpan = 0;
    for (let i = 0; i < correspondences.length; i++) {
      const p = correspondences[i];
      const predicted = {
        x: position.x + a * p.image.x - b * p.image.y,
        y: position.y + b * p.image.x + a * p.image.y,
      };
      squaredError += (predicted.x - p.world.x) ** 2 + (predicted.y - p.world.y) ** 2;
      for (let j = i + 1; j < correspondences.length; j++) {
        const q = correspondences[j];
        maxWorldSpan = Math.max(maxWorldSpan, Math.hypot(q.world.x - p.world.x, q.world.y - p.world.y));
      }
    }
    const rmsError = Math.sqrt(squaredError / correspondences.length);
    const allowedError = Math.max(15, maxWorldSpan * 0.08);
    if (!Number.isFinite(rmsError) || rmsError > allowedError) return undefined;
  }

  return {
    dataUrl: source.dataUrl,
    position,
    scale,
    opacity: Math.max(0, Math.min(1, opacity)),
    rotation: rotationRadians * 180 / Math.PI,
    locked: true,
  };
}

export function sourceBackgroundForRegistration(
  draft: Plan2WorldDraft,
  source: SourceFloorPlanImage,
  registration = draft.sourceRegistration,
  opacity = 0.35,
): BackgroundImage | undefined {
  if (!registration) return undefined;
  if (typeof source.dataUrl !== 'string' || !source.dataUrl.startsWith('data:image/')) {
    throw new Error('Source floor-plan image must be an image data URL.');
  }
  const anchors = resolveRegistrationAnchors(draft, registration, source);
  return similarityBackground(anchors, source, opacity);
}

function requireRegisteredBackground(
  draft: Plan2WorldDraft,
  source: SourceFloorPlanImage,
  opacity: number,
): BackgroundImage | undefined {
  if (!draft.sourceRegistration) return undefined;
  const background = sourceBackgroundForRegistration(draft, source, draft.sourceRegistration, opacity);
  if (!background) {
    throw new Error('Source registration anchors are inconsistent with the reconstructed geometry.');
  }
  return background;
}

/** Resolve the source-image transform that will be attached to the editor. */
export function sourceBackgroundForDraft(
  input: unknown,
  source: SourceFloorPlanImage,
  opacity = 0.35,
): BackgroundImage | undefined {
  const draft = parsePlan2WorldDraft(input);
  const registered = requireRegisteredBackground(draft, source, opacity);
  if (registered) return registered;
  const project = draftToProject(draft);
  const floor = project.floors[0];
  return floor ? sourceBackgroundForWalls(floor.walls, source, opacity) : undefined;
}

/** Convert a user-picked source-raster line into its current reconstructed plan length. */
export function sourceImageDistanceInPlanCm(
  input: unknown,
  source: SourceFloorPlanImage,
  start: NormalizedImagePoint,
  end: NormalizedImagePoint,
): number {
  const a = normalizedPoint(start, 'First calibration point');
  const b = normalizedPoint(end, 'Second calibration point');
  const width = positiveFinite(source.width, 'Source image width');
  const height = positiveFinite(source.height, 'Source image height');
  const pixelDistance = Math.hypot((b.x - a.x) * width, (b.y - a.y) * height);
  if (pixelDistance <= 1e-6) throw new Error('Pick two different points on the source image.');
  const background = sourceBackgroundForDraft(input, source);
  if (!background || !Number.isFinite(background.scale) || background.scale <= 0) {
    throw new Error('The source image could not be mapped to the reconstructed plan.');
  }
  return pixelDistance * background.scale;
}

export function draftToProjectWithSourceBackground(
  input: unknown,
  source: SourceFloorPlanImage,
  now = new Date(),
): Project {
  const draft = parsePlan2WorldDraft(input);
  const project = draftToProject(draft, now);
  const floor = project.floors.find(item => item.id === draft.sourceRegistration?.floorId) ?? project.floors[0];
  if (!floor) return project;

  const registered = requireRegisteredBackground(draft, source, 0.35);
  const backgroundImage = registered ?? sourceBackgroundForWalls(floor.walls, source);
  if (backgroundImage) floor.backgroundImage = {
    ...backgroundImage,
    reconstructionSource: {
      width: source.width,
      height: source.height,
      name: source.name,
      registration: registered ? 'anchors' : 'bounds',
      confidence: registered ? draft.sourceRegistration?.confidence : undefined,
    },
  };
  return project;
}
