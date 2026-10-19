import type { OpenAIConfig } from '$lib/utils/openaiClient';
import { generateOpenAIJsonFromImage } from '$lib/utils/openaiClient';
import { parsePlan2WorldDraft, type Plan2WorldDraft } from './draft';
import { PLAN2WORLD_COMPONENT_VOCABULARY } from './componentVocabulary';
import { buildReconstructionInstructions, PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION, type ReconstructionOptions } from './reconstructionInstructions';
export { buildReconstructionInstructions as buildFloorPlanVisionPrompt } from './reconstructionInstructions';

export const FLOOR_PLAN_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type FloorPlanImageType = typeof FLOOR_PLAN_IMAGE_TYPES[number];
export const MAX_FLOOR_PLAN_IMAGE_BYTES = 12 * 1024 * 1024;
export const PLAN2WORLD_VISION_PROMPT_VERSION = `${PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION}+${PLAN2WORLD_COMPONENT_VOCABULARY}`;

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


export async function reconstructFloorPlanImage(
  config: OpenAIConfig,
  image: EncodedFloorPlanImage,
  options: FloorPlanVisionOptions = {},
  customFetch: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Plan2WorldDraft> {
  const json = await generateOpenAIJsonFromImage(
    config,
    image.base64,
    image.mimeType,
    buildReconstructionInstructions(options),
    customFetch,
    signal,
  );
  return parsePlan2WorldDraft(json, { requireFurnitureVocabulary: true });
}
