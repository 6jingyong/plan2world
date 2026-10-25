import type { OpenAIConfig } from '$lib/utils/openaiClient';
import { generateOpenAIJsonFromImage } from '$lib/utils/openaiClient';
import type { Plan2WorldDraft } from './draft';
import { preflightArchitectureObservation, prepareArchitectureStage, assembleFrozenArchitecture, assertArchitectureHostsResolved } from './architecture';
import { summarizeArchitectureObservation } from './review';
import type { ReconstructionObservationReview } from '$lib/models/types';
import { decodeSourceFloorPlanImage } from './sourceBackground';
import type { SourceRasterPixels } from './rasterWallContinuation';
import { buildArchitectureInstructions, buildReconstructionInstructions, PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION, type ReconstructionOptions } from './reconstructionInstructions';
export { buildArchitectureInstructions as buildFloorPlanVisionPrompt } from './reconstructionInstructions';

export const FLOOR_PLAN_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type FloorPlanImageType = typeof FLOOR_PLAN_IMAGE_TYPES[number];
export const MAX_FLOOR_PLAN_IMAGE_BYTES = 12 * 1024 * 1024;
export const PLAN2WORLD_VISION_PROMPT_VERSION = PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION;

export interface FloorPlanVisionOptions extends ReconstructionOptions {
  sourceWidthPx?: number;
  sourceHeightPx?: number;
}

export interface EncodedFloorPlanImage {
  base64: string;
  dataUrl: string;
  mimeType: FloorPlanImageType;
}

function isFloorPlanImageType(value: string): value is FloorPlanImageType {
  return (FLOOR_PLAN_IMAGE_TYPES as readonly string[]).includes(value);
}

export async function encodeFloorPlanImage(file: File): Promise<EncodedFloorPlanImage> {
  if (!isFloorPlanImageType(file.type)) throw new Error('Choose a PNG, JPEG, or WebP floor-plan image.');
  if (file.size <= 0) throw new Error('The selected image is empty.');
  if (file.size > MAX_FLOOR_PLAN_IMAGE_BYTES) throw new Error('The floor-plan image is larger than 12 MB. Resize or compress it first.');

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The selected image could not be read.'));
    reader.readAsDataURL(file);
  });
  const marker = ';base64,', index = dataUrl.indexOf(marker);
  if (index < 0) throw new Error('The selected image could not be encoded.');
  return { base64: dataUrl.slice(index + marker.length), dataUrl, mimeType: file.type };
}

async function sourceForAssembly(image: EncodedFloorPlanImage, options: FloorPlanVisionOptions) {
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    const source = await decodeSourceFloorPlanImage(image.dataUrl);
    if (source.width * source.height > 24_000_000) throw new Error('Source raster exceeds the deterministic pixel budget.');
    if (options.sourceWidthPx !== undefined && options.sourceWidthPx !== source.width
      || options.sourceHeightPx !== undefined && options.sourceHeightPx !== source.height) throw new Error('Source dimensions disagree with original raster.');
    const element = new Image(); element.src = image.dataUrl; await element.decode();
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Cannot read source pixels for deterministic reconstruction.');
    context.drawImage(element, 0, 0);
    const raster: SourceRasterPixels = { width: source.width, height: source.height, data: context.getImageData(0, 0, source.width, source.height).data };
    return { context: { sourceWidthPx: source.width, sourceHeightPx: source.height }, raster };
  }
  if (options.sourceWidthPx !== undefined || options.sourceHeightPx !== undefined) {
    return { context: { sourceWidthPx: options.sourceWidthPx, sourceHeightPx: options.sourceHeightPx } };
  }
  return { context: {} };
}

export interface FloorPlanReconstructionResult {
  draft: Plan2WorldDraft;
  observationReview: ReconstructionObservationReview;
}

export async function reconstructFloorPlanImage(
  config: OpenAIConfig,
  image: EncodedFloorPlanImage,
  options: FloorPlanVisionOptions = {},
  customFetch: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<FloorPlanReconstructionResult> {
  const { sourceWidthPx: _sourceWidthPx, sourceHeightPx: _sourceHeightPx, ...instructionOptions } = options;
  const source = await sourceForAssembly(image, options);
  return reconstructFloorPlanWithObserver(
    prompt => generateOpenAIJsonFromImage(config, image.base64, image.mimeType, prompt, customFetch, signal),
    source, instructionOptions,
  );
}

/** The browser and native desktop authoring process share the same two-pass
 * contract. The observer owns only provider transport; original raster pixels
 * and all deterministic preparation/assembly stay outside the engine adapter. */
export async function reconstructFloorPlanWithObserver(
  observe: (prompt: string) => Promise<unknown>,
  source: { context: { sourceWidthPx?: number; sourceHeightPx?: number }; raster?: SourceRasterPixels },
  options: ReconstructionOptions = {},
): Promise<FloorPlanReconstructionResult> {
  const architectureInput = await observe(buildArchitectureInstructions(options));
  const architecture = preflightArchitectureObservation(architectureInput, source.context);
  const furnishing = await observe(
    `${buildReconstructionInstructions()}\n\nFROZEN_ARCHITECTURE_JSON:\n${JSON.stringify(architecture)}`,
  );
  const stage = prepareArchitectureStage(architecture, source.context, furnishing, source.raster);
  assertArchitectureHostsResolved(stage);
  return { draft: assembleFrozenArchitecture(stage, furnishing).draft,
    observationReview: summarizeArchitectureObservation(stage) };
}
