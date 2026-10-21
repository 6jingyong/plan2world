import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildFloorPlanVisionPrompt, reconstructFloorPlanImage, PLAN2WORLD_VISION_PROMPT_VERSION, type EncodedFloorPlanImage } from '$lib/plan2world/vision';
import { buildReconstructionInstructions } from '$lib/plan2world/reconstructionInstructions';

const image: EncodedFloorPlanImage = { base64: 'aGVsbG8=', dataUrl: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png' };
const decision = { decision: 'accept', decisionBasis: 'Visible source evidence.', evidence: 'Visible source stroke.' };
const architecture = {
  schemaVersion: 'source-architecture-v1',
  scaleEvidence: { kind: 'measured_dimension', realLengthCm: 360, endpoints: [{ x: 0, y: 0 }, { x: 360, y: 0 }], evidence: '360 cm printed dimension' },
  walls: [
    { label: 'north', ...decision, start: { x: 0, y: 0 }, end: { x: 360, y: 0 } },
    { label: 'east', ...decision, start: { x: 360, y: 0 }, end: { x: 360, y: 300 } },
    { label: 'south', ...decision, start: { x: 360, y: 300 }, end: { x: 0, y: 300 } },
    { label: 'west', ...decision, start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
  ],
  openings: [{ label: 'entry', ...decision, kind: 'door', endpoints: [{ x: 135, y: 0 }, { x: 225, y: 0 }] }],
  doorGaps: [],
};
const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: [{ sourceCategory: 'chair', position: { x: 180, y: 150 } }] };
const config = { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision-model' };
function responseJson(value: unknown): Response {
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }] }] }), { status: 200 });
}

describe('Plan2World architecture-first vision reconstruction', () => {
  it('loads both portable Skill stage references into browser prompts, without a competing prompt copy', () => {
    const prompt = buildFloorPlanVisionPrompt({ scaleHint: 'bottom wall is 360 cm' });
    expect(PLAN2WORLD_VISION_PROMPT_VERSION).toContain('architecture-furnishing-instructions-v21');
    expect(prompt).toContain(readFileSync('skills/reconstruct-plan2world/references/architecture-pass.md', 'utf8'));
    expect(prompt).toContain('For EVERY accepted door, window or sliding door');
    expect(prompt).toContain('bottom wall is 360 cm');
    expect(buildReconstructionInstructions()).toContain(readFileSync('skills/reconstruct-plan2world/references/furnishing-pass.md', 'utf8'));
  });

  it('observes architecture together, then permits furniture only, with deterministic IDs and full-height defaults', async () => {
    let pass = 0;
    const customFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('vision-model'); expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_object');
      expect(body.input[0].content[0]).toEqual({ type: 'input_image', image_url: image.dataUrl });
      const text = body.input[0].content.find((item: any) => item.type === 'input_text').text;
      if (pass === 0) expect(text).toContain('source-architecture-v1');
      else {
        expect(text).toContain('source-furnishing-v1');
        expect(text).toContain('FROZEN_ARCHITECTURE_JSON:');
        expect(JSON.parse(text.split('FROZEN_ARCHITECTURE_JSON:\n')[1]).openings).toHaveLength(1);
      }
      return responseJson(pass++ === 0 ? architecture : furnishing);
    });
    const before = JSON.stringify(architecture);
    const result = await reconstructFloorPlanImage(config, image, { sourceWidthPx: 360, sourceHeightPx: 300 }, customFetch as typeof fetch);
    expect(result.scale).toEqual({ mode: 'measured', confidence: 0.95, basis: '360 cm printed dimension' });
    expect(result.floors[0].doors![0]).toMatchObject({ id: 'd1', wallId: 'w1', position: 0.5, width: 90, height: 280 });
    expect(result.floors[0].furniture![0]).toMatchObject({ sourceCategory: 'chair', position: { x: 180, y: 150 } });
    expect(result.sourceRegistration?.anchors).toHaveLength(4);
    expect(JSON.stringify(architecture)).toBe(before); expect(customFetch).toHaveBeenCalledTimes(2);
  });

  it('collects furniture before final closure, then blocks an accepted opening without a baseline', async () => {
    const input = structuredClone(architecture); input.walls.shift();
    let pass = 0;
    const customFetch = vi.fn(async () => responseJson(pass++ === 0 ? input : furnishing));
    await expect(reconstructFloorPlanImage(config, image, {}, customFetch as typeof fetch)).rejects.toThrow(/unresolved accepted openings: entry/);
    expect(customFetch).toHaveBeenCalledTimes(2);
  });

  it('feeds the early furniture response into program closure before producing the final draft', async () => {
    const input = structuredClone(architecture);
    input.scaleEvidence.realLengthCm = 720;
    input.scaleEvidence.evidence = '720 cm printed dimension';
    input.walls.push({ label: 'partition', ...decision, start: { x: 0, y: 150 }, end: { x: 356, y: 150 } });
    input.openings.push({ label: 'partition entry', ...decision, kind: 'door', endpoints: [{ x: 135, y: 150 }, { x: 225, y: 150 }] });
    const earlyFurniture = { schemaVersion: 'source-furnishing-v1', furniture: [
      { sourceCategory: 'bed', position: { x: 180, y: 70 } },
      { sourceCategory: 'desk', position: { x: 180, y: 230 } },
    ] };
    let pass = 0;
    const customFetch = vi.fn(async () => responseJson(pass++ === 0 ? input : earlyFurniture));
    const before = JSON.stringify(input);
    const result = await reconstructFloorPlanImage(config, image, { sourceWidthPx: 360, sourceHeightPx: 300 }, customFetch as typeof fetch);
    expect(result.floors[0].walls.find(wall => wall.id === 'w5')!.end).toEqual({ x: 720, y: 300 });
    expect(result.floors[0].doors).toHaveLength(2);
    expect(customFetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(['walls', 'openings', 'scaleEvidence'])('rejects %s in a furniture response', async field => {
    let pass = 0;
    const customFetch = vi.fn(async () => responseJson(pass++ === 0 ? architecture : { ...furnishing, [field]: [] }));
    await expect(reconstructFloorPlanImage(config, image, {}, customFetch as typeof fetch)).rejects.toThrow(`unsupported fields: ${field}`);
  });

  it.each(['missing-version', 'invented-type', 'model-id'])('rejects invalid furniture evidence with %s', async failure => {
    const invalid: any = structuredClone(furnishing);
    if (failure === 'missing-version') delete invalid.schemaVersion;
    else if (failure === 'invented-type') invalid.furniture[0].sourceCategory = 'bay_window';
    else invalid.furniture[0].id = 'model-id';
    let pass = 0;
    const customFetch = vi.fn(async () => responseJson(pass++ === 0 ? architecture : invalid));
    await expect(reconstructFloorPlanImage(config, image, {}, customFetch as typeof fetch)).rejects.toThrow(
      failure === 'missing-version' ? 'source-furnishing-v1' : failure === 'invented-type' ? 'not in plan2world-furniture-v1' : 'unsupported fields: id');
  });

  it('surfaces provider refusals without another observation request', async () => {
    const customFetch = vi.fn(async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot process this image.' }] }] }), { status: 200 }));
    await expect(reconstructFloorPlanImage(config, image, {}, customFetch as typeof fetch)).rejects.toThrow(/refused/i);
    expect(customFetch).toHaveBeenCalledTimes(1);
  });
});
