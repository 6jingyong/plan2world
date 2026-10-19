import { createServer } from 'node:http';

export interface FloorPlanProviderRequest {
  path: string;
  method: string;
  body: Record<string, any>;
}

const draft = {
  schemaVersion: 'plan2world-draft-v1',
  presentation: 'semantic-white-model',
  furnitureVocabulary: 'plan2world-furniture-v1',
  name: 'Mock image reconstruction',
  units: 'cm',
  scale: { mode: 'measured', confidence: 0.99, basis: 'Mock provider test dimensions' },
  assumptions: ['Browser smoke-test response.'],
  floors: [{
    id: 'floor-0', name: 'Ground Floor', level: 0,
    walls: [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, kind: 'exterior' },
      { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 20, kind: 'exterior' },
      { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 20, kind: 'exterior' },
      { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 20, kind: 'exterior' },
    ],
    doors: [{ id: 'd1', wallId: 'w3', position: 0.5, width: 90, type: 'single' }],
    windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 120, type: 'standard' }],
    furniture: [],
  }],
};

export function createFloorPlanAIProvider(onRequest: (request: FloorPlanProviderRequest) => void = () => {}, responseDraft: object = draft) {
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }

    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    let body: Record<string, any> = {};
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; }
    catch { response.writeHead(400); response.end(); return; }
    const path = request.url || '';
    onRequest({ path, method: request.method || '', body });

    if (!path.endsWith('/responses') || request.method !== 'POST') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Unknown test endpoint' }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(responseDraft) }] }],
    }));
  });
}
