import { describe, expect, it, vi } from 'vitest';
import { buildFloorPlanVisionPrompt, reconstructFloorPlanImage, type EncodedFloorPlanImage } from '$lib/plan2world/vision';

const image: EncodedFloorPlanImage = {
  base64: 'aGVsbG8=',
  dataUrl: 'data:image/png;base64,aGVsbG8=',
  mimeType: 'image/png',
};

const draft = {
  schemaVersion: 'plan2world-draft-v1',
  presentation: 'semantic-white-model',
  furnitureVocabulary: 'plan2world-furniture-v1',
  name: 'Vision apartment',
  units: 'cm',
  scale: { mode: 'measured', confidence: 0.95, basis: '360 cm printed dimension' },
  assumptions: [],
  floors: [{
    id: 'floor-0', name: 'Ground Floor', level: 0,
    walls: [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 360, y: 0 }, kind: 'exterior' },
      { id: 'w2', start: { x: 360, y: 0 }, end: { x: 360, y: 300 }, kind: 'exterior' },
      { id: 'w3', start: { x: 360, y: 300 }, end: { x: 0, y: 300 }, kind: 'exterior' },
      { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, kind: 'exterior' },
    ],
    doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 90 }],
    windows: [],
    furniture: [],
  }],
};

describe('Plan2World vision reconstruction', () => {
  it('builds an evidence-first prompt and includes a real-length scale hint', () => {
    const prompt = buildFloorPlanVisionPrompt({ scaleHint: 'bottom wall is 360 cm' });
    expect(prompt).toContain('printed dimensions, scale bars');
    expect(prompt).toContain('bottom wall is 360 cm');
    expect(prompt).toContain('centreline paths');
    expect(prompt).toContain('curvePoint');
    expect(prompt).toContain('quadratic');
    expect(prompt).toContain('many tiny straight facets');
    expect(prompt).toContain('semantic-white-model');
    expect(prompt).toContain('sourceCategory');
    expect(prompt).toContain('floor-to-ceiling fixed glass');
    expect(prompt).toContain('one uniform cm-per-pixel');
    expect(prompt).toContain('bare drawing ratio');
    expect(prompt).toContain('NOT enough');
  });

  it('sends the image through Responses JSON mode and validates the returned draft', async () => {
    const customFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('vision-model');
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_object');
      expect(body.input[0].content[0]).toEqual({ type: 'input_image', image_url: image.dataUrl });
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(draft), annotations: [] }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await reconstructFloorPlanImage(
      { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision-model' },
      image,
      {},
      customFetch as typeof fetch,
    );

    expect(result.name).toBe('Vision apartment');
    expect(result.floors[0].walls).toHaveLength(4);
    expect(result.floors[0].doors?.[0].wallId).toBe('w1');
    expect(customFetch).toHaveBeenCalledTimes(1);
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

  it.each(['missing-version', 'invented-type'])('rejects a current AI response with %s', async failure => {
    const invalid: any = structuredClone(draft);
    if (failure === 'missing-version') delete invalid.furnitureVocabulary;
    else invalid.floors[0].furniture = [{id:'f1',catalogId:'imported_object',sourceCategory:'bay_window',position:{x:100,y:100}}];
    const customFetch = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed', output: [{type:'message',role:'assistant',status:'completed',
        content:[{type:'output_text',text:JSON.stringify(invalid)}]}],
    }), {status:200,headers:{'Content-Type':'application/json'}}));
    await expect(reconstructFloorPlanImage(
      {baseUrl:'https://example.test/v1',apiKey:'test',model:'vision-model'},image,{},customFetch as typeof fetch,
    )).rejects.toThrow(failure === 'missing-version' ? 'requires furnitureVocabulary' : 'not in plan2world-furniture-v1');
  });
});
