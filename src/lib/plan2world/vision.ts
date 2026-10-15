import type { OpenAIConfig } from '$lib/utils/openaiClient';
import { generateOpenAIJsonFromImage } from '$lib/utils/openaiClient';
import { parsePlan2WorldDraft, type Plan2WorldDraft } from './draft';

export const FLOOR_PLAN_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type FloorPlanImageType = typeof FLOOR_PLAN_IMAGE_TYPES[number];
export const MAX_FLOOR_PLAN_IMAGE_BYTES = 12 * 1024 * 1024;

export interface FloorPlanVisionOptions {
  scaleHint?: string;
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

  return `You are reconstructing one architectural floor-plan image into Plan2World draft JSON.
Return ONLY one JSON object. Do not wrap it in markdown and do not include commentary outside JSON.

Required contract:
- schemaVersion must be "plan2world-draft-v1".
- units must be "cm".
- Use exactly one floor for this first version.
- x increases to the right of the image; y increases downward.
- Walls are centreline paths. A normal wall uses straight start/end points. A visibly curved wall may additionally use one quadratic Bezier control point named curvePoint.
- Prefer one wall per continuous straight run or smooth quadratic arc. Do NOT approximate a simple visible curve with many tiny straight facets when one curvePoint describes it well. Split the wall only when curvature genuinely changes or a junction requires it.
- curvePoint is a plan-space control point in centimetres, in the same coordinate system as start/end. Omit it for straight walls; never invent curvature just to smooth noisy raster lines.
- Doors and windows MUST reference an existing wall id. Their position is a number from 0 to 1 measured from the wall start toward its end. For a curved wall, position follows the quadratic wall parameter from start to end.
- Keep IDs short and unique, for example w1, w2, d1, win1.
- Do not output rooms. Plan2World derives rooms from wall geometry.
- Do not output furniture. The user will place furniture interactively in the editor after the architecture is reconstructed.
- For exterior walls, kind="exterior"; interior partitions use kind="interior". If unclear, use "unknown".
- Typical editable defaults are wall height 280 cm, interior wall thickness 12 cm, exterior wall thickness 20 cm, door height 210 cm, window height 120 cm, and sill height 90 cm. Omit values rather than pretending they were visibly measured.
- confidence values, when present, must be between 0 and 1.
- The plan must form connected geometry wherever the drawing visibly connects. Intersections and T-junctions should share coordinates.
- Avoid duplicate or nearly duplicate walls.
- Preserve the source plan's relative geometry even when absolute scale is uncertain.

Scale rules:
1. First look for printed dimensions, scale bars, grid dimensions, or clearly labelled lengths.
2. If a trustworthy dimension exists, set scale.mode="measured", explain it in scale.basis, and use it to calibrate all coordinates.
3. If the user supplied a known real-world length below, use scale.mode="provided" when the hint is sufficiently explicit.
4. A bare drawing ratio such as "1:100" is NOT enough to calibrate an arbitrary raster image unless the image also preserves a known physical page size/DPI or contains a usable scale bar. Do not treat the ratio alone as a real-world length.
5. Otherwise estimate from architectural conventions, preferably a clearly drawn ordinary door around 80–90 cm wide. Set scale.mode="estimated", lower scale.confidence, and state the assumption.
${scaleHint ? `User scale hint: ${scaleHint}` : 'User scale hint: none.'}

Source-image registration:
- Also return sourceRegistration when you can identify at least two reliable correspondences between the source raster and reconstructed wall endpoints.
- sourceRegistration.floorId must identify the reconstructed floor.
- Each anchor MUST point to an existing reconstructed wall endpoint using wallId + endpoint ("start" or "end").
- anchor.image is the matching point in the ORIGINAL SOURCE IMAGE, normalized from 0 to 1 with (0,0) at the top-left and (1,1) at the bottom-right.
- Prefer exact visible wall-centreline corners or T-junctions. Do not use text labels, dimension-arrow endpoints, furniture, or page corners.
- Spread anchors across the plan. Use 3–6 anchors when reliable; 2 is the minimum. Avoid clustered anchors.
- sourceRegistration.confidence describes confidence in image-to-wall correspondence, not architectural scale.
- If fewer than two correspondences are reliable, omit sourceRegistration entirely. Do not invent anchors.

Openings:
- A door/window must sit on the wall it visually interrupts.
- Estimate opening width only when not labelled; lower confidence accordingly.
- Infer swing direction only when the swing arc is clear; otherwise use a conservative single door and default orientation.

The JSON object must have this shape:
{
  "schemaVersion": "plan2world-draft-v1",
  "name": "...",
  "units": "cm",
  "scale": { "mode": "measured|provided|estimated", "confidence": 0.0, "basis": "..." },
  "assumptions": ["..."],
  "sourceRegistration": {
    "floorId": "floor-0",
    "confidence": 0.85,
    "anchors": [
      { "wallId": "w1", "endpoint": "start", "image": { "x": 0.12, "y": 0.18 } },
      { "wallId": "w2", "endpoint": "end", "image": { "x": 0.82, "y": 0.76 } }
    ]
  },
  "floors": [{
    "id": "floor-0",
    "name": "Ground Floor",
    "level": 0,
    "walls": [{
      "id": "w1",
      "start": { "x": 0, "y": 0 },
      "end": { "x": 400, "y": 0 },
      "curvePoint": { "x": 200, "y": -80 },
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

Before answering, internally check that every opening references a wall that exists, that sourceRegistration anchors reference endpoints that exist, and that wall endpoints form the same connected topology shown in the source image.`;
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
