import type { OpenAIConfig } from '$lib/utils/openaiClient';
import { generateOpenAIJsonFromImage } from '$lib/utils/openaiClient';
import type { Plan2WorldDraft } from './draft';
import { buildBareHouse, type BareHouseV1 } from './bareHouse';
import { assemblePlan2WorldDraft } from './reconstructionAssembly';
import { buildReconstructionInstructions, PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION, type ReconstructionOptions } from './reconstructionInstructions';
export { buildReconstructionInstructions as buildFloorPlanVisionPrompt } from './reconstructionInstructions';

export const FLOOR_PLAN_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type FloorPlanImageType = typeof FLOOR_PLAN_IMAGE_TYPES[number];
export const MAX_FLOOR_PLAN_IMAGE_BYTES = 12 * 1024 * 1024;
export const PLAN2WORLD_VISION_PROMPT_VERSION = PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION;

export type FloorPlanVisionOptions = ReconstructionOptions;

export interface EncodedFloorPlanImage {
  base64: string;
  dataUrl: string;
  mimeType: FloorPlanImageType;
}

function isFloorPlanImageType(value: string): value is FloorPlanImageType {
  return (FLOOR_PLAN_IMAGE_TYPES as readonly string[]).includes(value);
}

export async function encodeFloorPlanImage(file: File): Promise<EncodedFloorPlanImage> {
  if (!isFloorPlanImageType(file.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP floor-plan image.');
  }
  if (file.size <= 0) throw new Error('The selected image is empty.');
  if (file.size > MAX_FLOOR_PLAN_IMAGE_BYTES) {
    throw new Error('The floor-plan image is larger than 12 MB. Resize or compress it first.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The selected image could not be read.'));
    reader.readAsDataURL(file);
  });

  const marker = ';base64,';
  const index = dataUrl.indexOf(marker);
  if (index < 0) throw new Error('The selected image could not be encoded.');
  return { base64: dataUrl.slice(index + marker.length), dataUrl, mimeType: file.type };
}

/** First model pass: extract only source-pixel walls and evidenced door gaps. */
export async function traceFloorPlanWalls(
  config: OpenAIConfig,
  image: EncodedFloorPlanImage,
  customFetch: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<BareHouseV1> {
  const trace = await generateOpenAIJsonFromImage(config, image.base64, image.mimeType,
    `Return only JSON: {"schemaVersion":"source-wall-trace-v1","walls":[],"doorGaps":[]}.
Trace visible wall centreline paths in original image pixels, not dimension-chain coordinates.
Walls have id,start,end and optional curvePoint. Door gaps require explicit observed wall endpoints and
fromWallId/toWallId; never trace door swing arcs as walls or infer missing boundaries.
Do not classify rooms, furnishings, components or windows. Do not invent enclosures.`, customFetch, signal);
  return buildBareHouse(trace);
}

export async function reconstructFloorPlanImage(
  config: OpenAIConfig,
  image: EncodedFloorPlanImage,
  options: FloorPlanVisionOptions = {},
  customFetch: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Plan2WorldDraft> {
  const bareHouse = await traceFloorPlanWalls(config, image, customFetch, signal);
  const annotations = await generateOpenAIJsonFromImage(
    config,
    image.base64,
    image.mimeType,
    `${buildReconstructionInstructions(options)}\n\nBARE_HOUSE_JSON:\n${JSON.stringify(bareHouse)}`,
    customFetch,
    signal,
  );
  return assemblePlan2WorldDraft(bareHouse, annotations);
}
