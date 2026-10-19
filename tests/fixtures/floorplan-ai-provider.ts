import { createServer } from 'node:http';

export interface FloorPlanProviderRequest {
  path: string;
  method: string;
  body: Record<string, any>;
}

type Point = { x: number; y: number };
type Wall = { id: string; start: Point; end: Point; curvePoint?: Point };

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

function pointAt(wall: Wall, t: number): Point {
  if (!wall.curvePoint) return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
  const u = 1 - t;
  return {
    x: u * u * wall.start.x + 2 * u * t * wall.curvePoint.x + t * t * wall.end.x,
    y: u * u * wall.start.y + 2 * u * t * wall.curvePoint.y + t * t * wall.end.y,
  };
}

function pathProfile(wall: Wall, steps = 128) {
  const samples = [{ t: 0, point: pointAt(wall, 0), distance: 0 }];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const point = pointAt(wall, t);
    const previous = samples[samples.length - 1];
    samples.push({ t, point, distance: previous.distance + Math.hypot(point.x - previous.point.x, point.y - previous.point.y) });
  }
  return samples;
}

function distanceAt(profile: ReturnType<typeof pathProfile>, t: number) {
  const scaled = Math.max(0, Math.min(1, t)) * (profile.length - 1);
  const index = Math.min(profile.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return profile[index].distance + (profile[index + 1].distance - profile[index].distance) * local;
}

function parameterAt(profile: ReturnType<typeof pathProfile>, distance: number) {
  const target = Math.max(0, Math.min(profile[profile.length - 1].distance, distance));
  for (let index = 0; index < profile.length - 1; index += 1) {
    if (profile[index + 1].distance < target) continue;
    const span = profile[index + 1].distance - profile[index].distance;
    const local = span <= 1e-9 ? 0 : (target - profile[index].distance) / span;
    return profile[index].t + (profile[index + 1].t - profile[index].t) * local;
  }
  return 1;
}

function openingEndpoints(opening: any, wall: Wall): [Point, Point] {
  const profile = pathProfile(wall);
  const center = distanceAt(profile, opening.position);
  const half = opening.width / 2;
  return [
    pointAt(wall, parameterAt(profile, center - half)),
    pointAt(wall, parameterAt(profile, center + half)),
  ];
}

function pointSegmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length2));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function distanceToWall(point: Point, wall: Wall) {
  const samples = pathProfile(wall, 64);
  let best = Infinity;
  for (let index = 0; index < samples.length - 1; index += 1) {
    best = Math.min(best, pointSegmentDistance(point, samples[index].point, samples[index + 1].point));
  }
  return best;
}

function requestText(body: Record<string, any>) {
  return body.input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text ?? '';
}

function bareHouseFromRequest(body: Record<string, any>) {
  const text = requestText(body);
  const marker = 'BARE_HOUSE_JSON:\n';
  const index = text.lastIndexOf(marker);
  if (index < 0) throw new Error('Second-pass test request did not include Bare House JSON');
  return JSON.parse(text.slice(index + marker.length));
}

function annotationsFor(responseDraft: any, bareHouse: any) {
  const floor = responseDraft.floors[0];
  const sourceWalls = new Map<string, Wall>(floor.walls.map((wall: Wall) => [wall.id, wall]));
  const normalizedWalls = new Map<string, Wall>(bareHouse.walls.map((wall: Wall) => [wall.id, wall]));
  const firstWall = floor.walls[0] as Wall;
  const firstProfile = pathProfile(firstWall);

  const opening = (item: any, kind: 'door' | 'window') => {
    const sourceWall = sourceWalls.get(item.wallId);
    if (!sourceWall) throw new Error(`Unknown fixture host ${item.wallId}`);
    const endpoints = openingEndpoints(item, sourceWall);
    const candidates: string[] = bareHouse.sourceWallMap?.[item.wallId] ?? [item.wallId];
    const ranked = candidates
      .map(id => ({ id, wall: normalizedWalls.get(id) }))
      .filter((entry): entry is { id: string; wall: Wall } => Boolean(entry.wall))
      .map(entry => ({ id: entry.id, score: Math.max(distanceToWall(endpoints[0], entry.wall), distanceToWall(endpoints[1], entry.wall)) }))
      .sort((a, b) => a.score - b.score);
    if (!ranked.length) throw new Error(`No normalized fixture host for ${item.id}`);
    const doorType = kind === 'door' && ['single', 'double', 'sliding', 'opening'].includes(item.type) ? item.type : undefined;
    return {
      id: item.id,
      kind,
      wallId: ranked[0].id,
      endpoints,
      evidence: 'Deterministic browser fixture opening evidence.',
      ...(doorType ? { doorType, typeEvidence: 'Deterministic browser fixture operation evidence.' } : {}),
      ...(item.confidence === undefined ? {} : { confidence: item.confidence }),
    };
  };

  return {
    schemaVersion: 'source-annotation-v1',
    scaleEvidence: {
      mode: responseDraft.scale?.mode ?? 'measured',
      realLengthCm: firstProfile[firstProfile.length - 1].distance,
      endpoints: [firstWall.start, firstWall.end],
      confidence: responseDraft.scale?.confidence ?? 1,
      basis: responseDraft.scale?.basis ?? 'Deterministic browser fixture 1:1 source scale',
    },
    openings: [
      ...(floor.doors ?? []).map((item: any) => opening(item, 'door')),
      ...(floor.windows ?? []).map((item: any) => opening(item, 'window')),
    ],
    furniture: (floor.furniture ?? []).map((item: any) => ({
      id: item.id,
      sourceCategory: item.sourceCategory,
      position: item.position,
      ...(item.confidence === undefined ? {} : { confidence: item.confidence }),
    })),
    assumptions: responseDraft.assumptions ?? [],
  };
}

export function createFloorPlanAIProvider(onRequest: (request: FloorPlanProviderRequest) => void = () => {}, responseDraft: object = draft) {
  let callCount = 0;
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
    const pass = callCount++ % 2;
    const output = pass === 0
      ? { schemaVersion: 'source-wall-trace-v1', walls: (responseDraft as any).floors[0].walls.map((wall: any) => ({ id: wall.id, start: wall.start, end: wall.end, ...(wall.curvePoint ? { curvePoint: wall.curvePoint } : {}) })), doorGaps: [] }
      : annotationsFor(responseDraft, bareHouseFromRequest(body));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
    }));
  });
}
