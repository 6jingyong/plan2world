import type { OpenAIConfig } from '$lib/utils/openaiClient';
import { generateOpenAIJsonFromImage } from '$lib/utils/openaiClient';
import { parsePlan2WorldDraft, type Plan2WorldDraft } from './draft';

export const FLOOR_PLAN_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type FloorPlanImageType = typeof FLOOR_PLAN_IMAGE_TYPES[number];
export const MAX_FLOOR_PLAN_IMAGE_BYTES = 12 * 1024 * 1024;

export interface FloorPlanVisionOptions {
  scaleHint?: string;
  includeFurniture?: boolean;
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

export function buildFloorPlanVisionPrompt(options: FloorPlanVisionOptions = {}): string {
  const scaleHint = options.scaleHint?.trim();
  const furnitureRule = options.includeFurniture
    ? 'If furniture symbols are visually clear and map confidently to ordinary categories, you may include them. Otherwise omit furniture.'
    : 'Do not include furniture. The user will place furniture interactively after reconstruction.';

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object. Do not wrap it in markdown and do not include commentary outside JSON.

Required contract:
- schemaVersion must be "plan2world-draft-v1".
- units must be "cm".
- Use exactly one floor for this first version unless the supplied image itself is clearly a single level from a multi-level sheet and only one level is being reconstructed.
- x increases to the right of the image; y increases downward.
- Walls are straight centreline segments. Prefer one wall segment per continuous straight wall run.
- Doors and windows MUST reference an existing wall id. Their position is a number from 0 to 1 measured from the wall start toward its end.
- Keep IDs short and unique, for example w1, w2, d1, win1.
- Do not output rooms. Plan2World derives rooms from wall geometry.
- For exterior walls, kind="exterior"; interior partitions use kind="interior". If unclear, use "unknown".
- Typical editable defaults are wall height 280 cm, interior wall thickness 12 cm, exterior wall thickness 20 cm, door height 210 cm, window height 120 cm, and sill height 90 cm. Omit values rather than pretending they were visibly measured.
- confidence values, when present, must be between 0 and 1.
- The plan must form connected geometry wherever the drawing visibly connects. Intersections and T-junctions should share coordinates.
- Avoid duplicate or nearly duplicate walls.
- Preserve the source plan's relative geometry even when absolute scale is uncertain.

Scale rules:
1. First look for printed dimensions, scale bars, grid dimensions, or clearly labelled lengths.
2. If a trustworthy dimension exists, set scale.mode="measured", explain it in scale.basis, and use it to calibrate all coordinates.
3. If the user supplied a scale hint below, use scale.mode="provided" when the hint is sufficiently explicit.
4. Otherwise estimate from architectural conventions, preferably a clearly drawn ordinary door around 80–90 cm wide. Set scale.mode="estimated", lower scale.confidence, and state the assumption.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Openings:
- A door/window must sit on the wall it visually interrupts.
- Estimate opening width only when not labelled; lower confidence accordingly.
- Infer swing direction only when the swing arc is clear; otherwise use a conservative single door and default orientation.

${furnitureRule}

The JSON object must have this shape:
{
  "schemaVersion": "plan2world-draft-v1",
  "name": "...",
  "units": "cm",
  "scale": { "mode": "measured|provided|estimated", "confidence": 0.0, "basis": "..." },
  "assumptions": ["..."],
  "floors": [{
    "id": "floor-0",
    "name": "Ground Floor",
    "level": 0,
    "walls": [{
      "id": "w1",
      "start": { "x": 0, "y": 0 },
      "end": { "x": 400, "y": 0 },
      "thickness": 20,
      "height": 280,
      "kind": "exterior",
      "confidence": 0.95
    }],
    "doors": [{
      "id": "d1",
      "wallId": "w1",
      "position": 0.5,
      "width": 90,
      "height": 210,
      "type": "single",
      "swingDirection": "left",
      "flipSide": false,
      "confidence": 0.8
    }],
    "windows": [],
    "furniture": []
  }]
}

Before answering, internally check that every opening references a wall that exists and that wall endpoints form the same connected topology shown in the source image.`;
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
    buildFloorPlanVisionPrompt(options),
    customFetch,
    signal,
  );
  return parsePlan2WorldDraft(json);
}
