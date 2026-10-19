import { describe, expect, it, vi } from 'vitest';
import { buildFloorPlanVisionPrompt, reconstructFloorPlanImage, PLAN2WORLD_VISION_PROMPT_VERSION, type EncodedFloorPlanImage } from '$lib/plan2world/vision';

const image: EncodedFloorPlanImage = {
  base64: 'aGVsbG8=',
  dataUrl: 'data:image/png;base64,aGVsbG8=',
  mimeType: 'image/png',
};

const trace = {
  schemaVersion: 'source-wall-trace-v1',
  walls: [
    { id: 'w1', start: { x: 0, y: 0 }, end: { x: 360, y: 0 } },
    { id: 'w2', start: { x: 360, y: 0 }, end: { x: 360, y: 300 } },
    { id: 'w3', start: { x: 360, y: 300 }, end: { x: 0, y: 300 } },
    { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
  ],
  doorGaps: [],
};

const annotation = {
  schemaVersion: 'source-annotation-v1',
  scaleEvidence: {
    mode: 'measured',
    realLengthCm: 360,
    endpoints: [{ x: 0, y: 0 }, { x: 360, y: 0 }],
    confidence: 0.95,
    basis: '360 cm printed dimension',
  },
  openings: [{
    id: 'd1', kind: 'door', wallId: 'w1',
    endpoints: [{ x: 135, y: 0 }, { x: 225, y: 0 }],
    evidence: 'Visible jamb-to-jamb aperture',
  }],
  furniture: [],
};

function responseJson(value: unknown): Response {
  return new Response(JSON.stringify({ status: 'completed', output: [{
    type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }],
  }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Plan2World vision reconstruction', () => {
  it('instructs the second pass to return evidence instead of calculated draft geometry', () => {
    const prompt = buildFloorPlanVisionPrompt({ scaleHint: 'bottom wall is 360 cm' });
    expect(PLAN2WORLD_VISION_PROMPT_VERSION).toContain('source-annotation-instructions-v16');
    expect(prompt).toContain('source-annotation-v1');
    expect(prompt).toContain('Do not return plan2world-draft-v1');
    expect(prompt).toContain('ORIGINAL SOURCE IMAGE PIXELS');
    expect(prompt).toContain('wallId MUST be an existing normalized Bare House wall ID');
    expect(prompt).toContain('DO NOT calculate cmPerPixel');
    expect(prompt).toContain('opening width or position');
    expect(prompt).toContain('catalogId');
    expect(prompt).toContain('Programs will calculate scale');
    expect(prompt).toContain('bottom wall is 360 cm');
  });

  it('uses two visual passes then assembles the returned evidence deterministically', async () => {
    let pass = 0;
    const customFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('vision-model');
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_object');
      expect(body.input[0].content[0]).toEqual({ type: 'input_image', image_url: image.dataUrl });
      if (pass === 1) {
        const text = body.input[0].content.find((item: any) => item.type === 'input_text')?.text;
        expect(text).toContain('BARE_HOUSE_JSON:');
        expect(text).toContain('"schemaVersion":"bare-house-v1"');
      }
      return responseJson(pass++ === 0 ? trace : annotation);
    });

    const result = await reconstructFloorPlanImage(
      { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision-model' },
      image,
      {},
      customFetch as typeof fetch,
    );

    expect(result.name).toBe('AI floor-plan reconstruction');
    expect(result.scale).toEqual({ mode: 'measured', confidence: 0.95, basis: '360 cm printed dimension' });
    expect(result.floors[0].walls).toHaveLength(4);
    expect(result.floors[0].walls[0]).toMatchObject({ id: 'w1', start: { x: 0, y: 0 }, end: { x: 360, y: 0 } });
    expect(result.floors[0].doors?.[0]).toMatchObject({ id: 'd1', wallId: 'w1', position: 0.5, width: 90 });
    expect(customFetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces provider refusals instead of trying to import them', async () => {
    const customFetch = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'refusal', refusal: 'Cannot process this image.' }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(reconstructFloorPlanImage(
      { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision-model' },
      image,
      {},
      customFetch as typeof fetch,
    )).rejects.toThrow(/refused/i);
  });

  it.each(['missing-version', 'invented-type'])('rejects invalid second-pass evidence with %s', async failure => {
    const invalid: any = structuredClone(annotation);
    if (failure === 'missing-version') delete invalid.schemaVersion;
    else invalid.furniture = [{ id: 'f1', sourceCategory: 'bay_window', position: { x: 100, y: 100 } }];
    let pass = 0;
    const customFetch = vi.fn(async () => responseJson(pass++ === 0 ? trace : invalid));
    await expect(reconstructFloorPlanImage(
      { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision-model' }, image, {}, customFetch as typeof fetch,
    )).rejects.toThrow(failure === 'missing-version' ? 'source-annotation-v1' : 'not in plan2world-furniture-v1');
  });

  it('rejects model-authored derived opening geometry', async () => {
    const invalid: any = structuredClone(annotation);
    invalid.openings[0].width = 90;
    let pass = 0;
    const customFetch = vi.fn(async () => responseJson(pass++ === 0 ? trace : invalid));
    await expect(reconstructFloorPlanImage(
      { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision-model' }, image, {}, customFetch as typeof fetch,
    )).rejects.toThrow(/unsupported fields: width/);
  });
});
