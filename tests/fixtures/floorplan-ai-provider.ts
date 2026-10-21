import { createServer } from 'node:http';

export interface FloorPlanProviderRequest { path: string; method: string; body: Record<string, any> }
export interface FloorPlanProviderFixtureOptions { sourceWidthPx?: number; sourceHeightPx?: number }
type Point = { x: number; y: number };
type Wall = { id: string; start: Point; end: Point; curvePoint?: Point };

const defaultFixtureDraft = {
  schemaVersion: 'plan2world-draft-v1', furnitureVocabulary: 'plan2world-furniture-v1',
  name: 'Mock image reconstruction', units: 'cm', scale: { mode: 'measured', confidence: 0.99, basis: 'Mock provider test dimensions' },
  assumptions: ['Browser smoke-test response.'], floors: [{ id: 'floor-0', name: 'Ground Floor', level: 0,
    walls: [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }, { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
      { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 } }, { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
    ],
    doors: [{ id: 'd1', wallId: 'w3', position: 0.5, width: 90, type: 'single' }],
    windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 120, type: 'standard' }], furniture: [],
  }],
};

function pointAt(wall: Wall, t: number): Point {
  if (!wall.curvePoint) return { x: wall.start.x + (wall.end.x - wall.start.x) * t, y: wall.start.y + (wall.end.y - wall.start.y) * t };
  const u = 1 - t;
  return { x: u*u*wall.start.x + 2*u*t*wall.curvePoint.x + t*t*wall.end.x, y: u*u*wall.start.y + 2*u*t*wall.curvePoint.y + t*t*wall.end.y };
}

function pathProfile(wall: Wall, steps = 128) {
  const samples = [{ t: 0, point: pointAt(wall, 0), distance: 0 }];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps, point = pointAt(wall, t), previous = samples.at(-1)!;
    samples.push({ t, point, distance: previous.distance + Math.hypot(point.x - previous.point.x, point.y - previous.point.y) });
  }
  return samples;
}

function distanceAt(profile: ReturnType<typeof pathProfile>, t: number) {
  const scaled = Math.max(0, Math.min(1, t)) * (profile.length - 1), index = Math.min(profile.length - 2, Math.floor(scaled)), local = scaled - index;
  return profile[index].distance + (profile[index + 1].distance - profile[index].distance) * local;
}

function parameterAt(profile: ReturnType<typeof pathProfile>, distance: number) {
  const target = Math.max(0, Math.min(profile.at(-1)!.distance, distance));
  for (let index = 0; index < profile.length - 1; index += 1) {
    if (profile[index + 1].distance < target) continue;
    const span = profile[index + 1].distance - profile[index].distance, local = span <= 1e-9 ? 0 : (target - profile[index].distance) / span;
    return profile[index].t + (profile[index + 1].t - profile[index].t) * local;
  }
  return 1;
}

function projectionForFixture(fixtureDraft: any, options: FloorPlanProviderFixtureOptions) {
  const width = options.sourceWidthPx, height = options.sourceHeightPx, registration = fixtureDraft.sourceRegistration;
  if (width === undefined && height === undefined) return { cmPerPixel: 1, worldToSource: (point: Point) => ({ ...point }) };
  if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) throw new Error('Registered fixture requires positive source dimensions');
  if (!registration?.anchors || registration.anchors.length < 2) throw new Error('Registered fixture requires sourceRegistration anchors');

  const floor = fixtureDraft.floors.find((item: any) => item.id === registration.floorId);
  const walls = new Map<string, Wall>(floor.walls.map((wall: Wall) => [wall.id, wall]));
  const pairs = registration.anchors.map((anchor: any) => ({ image: { x: anchor.image.x * width!, y: anchor.image.y * height! }, world: walls.get(anchor.wallId)?.[anchor.endpoint as 'start'|'end'] }));
  if (pairs.some((pair: any) => !pair.world)) throw new Error('Invalid registered fixture anchor');

  const n = pairs.length;
  const imageMean = pairs.reduce((sum: Point, pair: any) => ({ x: sum.x + pair.image.x / n, y: sum.y + pair.image.y / n }), { x: 0, y: 0 });
  const worldMean = pairs.reduce((sum: Point, pair: any) => ({ x: sum.x + pair.world.x / n, y: sum.y + pair.world.y / n }), { x: 0, y: 0 });
  let denominator = 0, dot = 0, cross = 0;
  for (const pair of pairs) {
    const px = pair.image.x-imageMean.x, py = pair.image.y-imageMean.y, qx = pair.world.x-worldMean.x, qy = pair.world.y-worldMean.y;
    denominator += px*px + py*py; dot += px*qx + py*qy; cross += px*qy - py*qx;
  }
  if (denominator <= 1e-9) throw new Error('Registered fixture anchors are degenerate');
  const a = dot/denominator, b = cross/denominator, cmPerPixel = Math.hypot(a,b), inverse = a*a+b*b;
  const translation = { x: worldMean.x-(a*imageMean.x-b*imageMean.y), y: worldMean.y-(b*imageMean.x+a*imageMean.y) };
  return { cmPerPixel, worldToSource: (world: Point): Point => {
    const dx = world.x-translation.x, dy = world.y-translation.y;
    return { x: (a*dx+b*dy)/inverse, y: (-b*dx+a*dy)/inverse };
  } };
}

function evidenceForFixture(fixtureDraft: any, options: FloorPlanProviderFixtureOptions) {
  const projection = projectionForFixture(fixtureDraft, options), floor = fixtureDraft.floors[0];
  const walls = floor.walls.map((wall: Wall) => ({ id: wall.id, start: projection.worldToSource(wall.start), end: projection.worldToSource(wall.end), ...(wall.curvePoint ? { curvePoint: projection.worldToSource(wall.curvePoint) } : {}) }));
  return { projection, walls };
}

function openingEvidence(item: any, kind: 'door'|'window', sourceWall: Wall, cmPerPixel: number) {
  const profile = pathProfile(sourceWall), center = distanceAt(profile, item.position), half = item.width/cmPerPixel/2;
  const endpoints: [Point,Point] = [pointAt(sourceWall, parameterAt(profile, center-half)), pointAt(sourceWall, parameterAt(profile, center+half))];
  const doorType = kind === 'door' && ['single','double','sliding','opening'].includes(item.type) ? item.type : undefined;
  return { kind, endpoints, evidence: 'Deterministic browser fixture opening evidence.', ...(doorType ? { doorType, typeEvidence: 'Deterministic browser fixture operation evidence.' } : {}) };
}

function annotationForFixture(fixtureDraft: any, evidence: ReturnType<typeof evidenceForFixture>) {
  const floor = fixtureDraft.floors[0], sourceWalls = new Map<string,Wall>(evidence.walls.map((wall: Wall) => [wall.id, wall])), worldWalls = new Map<string,Wall>(floor.walls.map((wall: Wall) => [wall.id, wall]));
  const sourceWall = evidence.walls[0] as Wall, worldWall = worldWalls.get(sourceWall.id)!;
  const scaleKind = fixtureDraft.scale?.mode === 'provided' ? 'provided_length' : fixtureDraft.scale?.mode === 'estimated' ? 'estimated_reference' : 'measured_dimension';
  return {
    schemaVersion: 'source-annotation-v1',
    scaleEvidence: { kind: scaleKind, realLengthCm: pathProfile(worldWall).at(-1)!.distance, endpoints: [sourceWall.start, sourceWall.end], evidence: fixtureDraft.scale?.basis ?? 'Deterministic browser fixture scale evidence' },
    openings: [
      ...(floor.doors ?? []).map((item: any) => openingEvidence(item, 'door', sourceWalls.get(item.wallId)!, evidence.projection.cmPerPixel)),
      ...(floor.windows ?? []).map((item: any) => openingEvidence(item, 'window', sourceWalls.get(item.wallId)!, evidence.projection.cmPerPixel)),
    ],
    furniture: (floor.furniture ?? []).map((item: any) => ({ sourceCategory: item.sourceCategory, position: evidence.projection.worldToSource(item.position) })),
    assumptions: fixtureDraft.assumptions ?? [],
  };
}

export function createFloorPlanAIProvider(onRequest: (request: FloorPlanProviderRequest) => void = () => {}, fixtureDraft: object = defaultFixtureDraft, options: FloorPlanProviderFixtureOptions = {}) {
  let callCount = 0;
  const evidence = evidenceForFixture(fixtureDraft, options), annotation = annotationForFixture(fixtureDraft, evidence);
  const decision = { decision: 'accept', evidence: 'Declared synthetic source evidence.', decisionBasis: 'Declared fixture geometry.' };
  const architecture = { schemaVersion: 'source-architecture-v1', scaleEvidence: annotation.scaleEvidence,
    ...(fixtureDraft === defaultFixtureDraft ? { functionalZones: [{ ...decision, label: 'Mock living area', category: 'living', environment: 'indoor',
      position: { x: 200, y: 150 }, boundary: evidence.walls.map((wall: Wall) => ({ point: wall.start, kind: 'wall', evidence: 'Declared synthetic perimeter.' })) }] } : {}),
    walls: evidence.walls.map(({ id: _id, ...wall }: Wall, index: number) => ({ ...wall, ...decision, label: `boundary ${index + 1}` })),
    openings: annotation.openings.map((opening, index) => ({ ...opening, ...decision, label: `opening ${index + 1}` })),
    assumptions: annotation.assumptions, doorGaps: [] };
  const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: annotation.furniture, assumptions: [] };
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods','POST, OPTIONS'); response.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); response.setHeader('Cache-Control','no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    let body: Record<string,any> = {}; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { response.writeHead(400); response.end(); return; }
    const path = request.url || ''; onRequest({ path, method: request.method || '', body });
    if (!path.endsWith('/responses') || request.method !== 'POST') { response.writeHead(404, {'Content-Type':'application/json'}); response.end(JSON.stringify({ error: 'Unknown test endpoint' })); return; }
    const output = callCount++ % 2 === 0 ? architecture : furnishing;
    response.writeHead(200, {'Content-Type':'application/json'});
    response.end(JSON.stringify({ output: [{ type:'message', content:[{ type:'output_text', text:JSON.stringify(output) }] }] }));
  });
}
