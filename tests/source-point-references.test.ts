import { describe, expect, it } from 'vitest';
import { expandSourcePointReferences, SOURCE_POINT_REFERENCES_VERSION } from '$lib/plan2world/sourcePointReferences';
import { parseSourceArchitecture, prepareArchitectureStage, preflightArchitectureObservation, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';

const evidence = { evidence: 'Visible source stroke/frame.', decision: 'accept', decisionBasis: 'Visible architectural evidence.' };
function observation(): any {
  return { schemaVersion: SOURCE_POINT_REFERENCES_VERSION,
    sourcePoints: [['NW', 0, 0], ['north junction', 100, 0], ['NE', 200, 0], ['SE', 200, 100], ['south junction', 100, 100], ['SW', 0, 100]],
    scaleEvidence: { kind: 'measured_dimension', realLengthCm: 200, endpoints: ['NW', 'NE'], evidence: 'Printed 200cm dimension.' },
    walls: [
      { label: 'north', start: 'NW', end: 'NE', ...evidence },
      { label: 'east', start: 'NE', end: 'SE', ...evidence },
      { label: 'south', start: 'SE', end: 'SW', ...evidence },
      { label: 'west', start: 'SW', end: 'NW', ...evidence },
      { label: 'shared partition', start: 'north junction', end: 'south junction', ...evidence },
    ],
    openings: [{ label: 'inter-room entrance', kind: 'door', endpoints: [{ x: 100, y: 35 }, { x: 100, y: 65 }], ...evidence }],
    junctions: [{ label: 'visible T junction', position: 'north junction', ...evidence }], doorGaps: [], assumptions: [],
    functionalZones: [
      { label: 'west', category: 'room', environment: 'indoor', position: { x: 50, y: 50 }, boundary: ['NW', 'north junction', 'south junction', 'SW'].map(point => ({ point, kind: 'wall', evidence: 'Visible enclosing boundary.' })), ...evidence },
      { label: 'east', category: 'room', environment: 'indoor', position: { x: 150, y: 50 }, boundary: ['north junction', 'NE', 'SE', 'south junction'].map(point => ({ point, kind: 'wall', evidence: 'Visible enclosing boundary.' })), ...evidence },
    ] };
}
function inline(): any {
  return { schemaVersion: 'source-architecture-v1',
    scaleEvidence: { kind: 'measured_dimension', realLengthCm: 200, endpoints: [{ x: 0, y: 0 }, { x: 200, y: 0 }], evidence: 'Printed 200cm dimension.' },
    walls: [
      { label: 'north', start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, ...evidence },
      { label: 'east', start: { x: 200, y: 0 }, end: { x: 200, y: 100 }, ...evidence },
      { label: 'south', start: { x: 200, y: 100 }, end: { x: 0, y: 100 }, ...evidence },
      { label: 'west', start: { x: 0, y: 100 }, end: { x: 0, y: 0 }, ...evidence },
      { label: 'shared partition', start: { x: 100, y: 0 }, end: { x: 100, y: 100 }, ...evidence },
    ], openings: [{ label: 'inter-room entrance', kind: 'door', endpoints: [{ x: 100, y: 35 }, { x: 100, y: 65 }], ...evidence }],
    junctions: [{ label: 'visible T junction', position: { x: 100, y: 0 }, ...evidence }], doorGaps: [], assumptions: [],
    functionalZones: [
      { label: 'west', category: 'room', environment: 'indoor', position: { x: 50, y: 50 }, boundary: [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => ({ point: { x, y }, kind: 'wall', evidence: 'Visible enclosing boundary.' })), ...evidence },
      { label: 'east', category: 'room', environment: 'indoor', position: { x: 150, y: 50 }, boundary: [[100, 0], [200, 0], [200, 100], [100, 100]].map(([x, y]) => ({ point: { x, y }, kind: 'wall', evidence: 'Visible enclosing boundary.' })), ...evidence },
    ] };
}

describe('opt-in source-point observation transport', () => {
  it('preserves the existing stage, native IDs, opening matching and furniture-guided assembly exactly', () => {
    const raw = observation(), before = JSON.stringify(raw), result = expandSourcePointReferences(raw, { width: 200, height: 100 });
    expect(result.architecture).toEqual(parseSourceArchitecture(inline()));
    const context = { sourceWidthPx: 200, sourceHeightPx: 100 };
    const furniture = { schemaVersion: 'source-furnishing-v1', furniture: [{ sourceCategory: 'chair', position: { x: 50, y: 50 } }, { sourceCategory: 'chair', position: { x: 150, y: 50 } }], assumptions: [] };
    const a = prepareArchitectureStage(inline(), context, furniture), b = prepareArchitectureStage(result.architecture, context, furniture);
    expect(b).toEqual(a);
    expect(assembleFrozenArchitecture(b, furniture)).toEqual(assembleFrozenArchitecture(a, furniture));
    expect(result.audit).toMatchObject({ declaredPointCount: 6, usedPointCount: 6, referenceCount: 21, inlinePointCount: 4,
      coordinatePairsAuthored: 10, coordinateOccurrencesExpanded: 25, avoidedRepeatedCoordinatePairs: 15, topologyComputed: false, coordinatesChanged: false });
    expect(JSON.stringify(raw)).toBe(before);
    result.architecture.walls[0].start.x = 5;
    expect(result.audit.points.find(p => p.label === 'NW')!.position.x).toBe(0);
  });

  it('retains curves, door-gap evidence and uncertain/rejected candidates without assigning hosts', () => {
    const raw = observation(); raw.sourcePoints.push(['bow control', 100, 10]); raw.walls[0].curvePoint = 'bow control';
    raw.functionalZones[0].boundary[0].curvePoint = 'bow control';
    raw.doorGaps = [{ from: 'NW', to: 'north junction', evidence: 'Observed source gap.' }];
    raw.openings.push({ ...raw.openings[0], label: 'uncertain', decision: 'uncertain' }, { ...raw.openings[0], label: 'rejected', decision: 'reject' });
    const { architecture } = expandSourcePointReferences(raw);
    expect(architecture.walls[0].curvePoint).toEqual({ x: 100, y: 10 });
    expect(architecture.functionalZones![0].boundary[0].curvePoint).toEqual({ x: 100, y: 10 });
    expect(architecture.doorGaps[0]).toEqual({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, evidence: 'Observed source gap.' });
    expect(architecture.openings.map(o => o.decision)).toEqual(['accept', 'uncertain', 'reject']);
    expect(architecture.openings[0]).not.toHaveProperty('wallId');
  });

  it('rejects unknown names, duplicate declarations and nonliteral declarations', () => {
    const unknown = observation(); unknown.walls[0].start = 'missing';
    expect(() => expandSourcePointReferences(unknown)).toThrow(/Unknown source point.*walls\[0\].start/);
    const duplicate = observation(); duplicate.sourcePoints.push(['NW', 1, 2]);
    expect(() => expandSourcePointReferences(duplicate)).toThrow(/Duplicate source point/);
    for (const tuple of [['bad', 1], ['bad', 'NW', 0], [' bad', 0, 0], ['bad', Infinity, 0]]) {
      const raw = observation(); raw.sourcePoints.push(tuple);
      expect(() => expandSourcePointReferences(raw)).toThrow();
    }
  });

  it('checks unused points against the source and exposes valid unused declarations', () => {
    const raw = observation(); raw.sourcePoints.push(['unused', 20, 20]);
    expect(expandSourcePointReferences(raw, { width: 200, height: 100 }).audit.unusedPointNames).toEqual(['unused']);
    raw.sourcePoints.push(['outside', 201, 20]);
    expect(() => expandSourcePointReferences(raw, { width: 200, height: 100 })).toThrow(/outside the source raster/);
    expect(() => expandSourcePointReferences(raw, { width: 0, height: 100 })).toThrow(/positive and finite/);
  });

  it('leaves duplicate geometry for the unchanged preflight to reject, without repairing observations', () => {
    const raw = observation(); raw.walls.push({ ...raw.walls[4], label: 'duplicate shared wall', start: 'south junction', end: 'north junction' });
    const { architecture } = expandSourcePointReferences(raw);
    expect(architecture.walls).toHaveLength(6);
    expect(() => preflightArchitectureObservation(architecture)).toThrow(/Duplicate normalized wall geometry/);
  });

  it('keeps the production parser opt-in and rejects native scene/host fields', () => {
    expect(() => parseSourceArchitecture(observation())).toThrow(/unsupported fields/);
    const host = observation(); host.openings[0].wallId = 'w1';
    expect(() => expandSourcePointReferences(host)).toThrow(/unsupported fields: wallId/);
    const rooms = observation(); rooms.rooms = [];
    expect(() => expandSourcePointReferences(rooms)).toThrow(/unsupported fields: rooms/);
    const reserved = observation(); reserved.sourcePoints.push(['__proto__', 10, 10]); reserved.junctions[0].position = '__proto__';
    expect(expandSourcePointReferences(reserved).architecture.junctions[0].position).toEqual({ x: 10, y: 10 });
  });

  it('CLI freezes source/code identity and refuses to overwrite an expansion', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pointrefs-'));
    try {
      const input = join(dir, 'raw.json'), source = join(dir, 'source.png'), output = join(dir, 'expanded');
      const png = encodeRgbaPng({ width: 200, height: 100, data: new Uint8Array(200 * 100 * 4).fill(255) });
      await writeFile(input, JSON.stringify(observation())); await writeFile(source, png);
      const args = ['tooling/expand-plan2world-pointrefs.mjs', '--input', input, '--source', source, '--output', output];
      execFileSync(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' });
      const saved = await readFile(join(output, 'source-architecture.json'), 'utf8');
      const provenance = JSON.parse(await readFile(join(output, 'provenance.json'), 'utf8'));
      expect(provenance.source).toMatchObject({ sha256: createHash('sha256').update(png).digest('hex'), width: 200, height: 100 });
      expect(provenance.code['src/lib/plan2world/sourcePointReferences.ts']).toMatch(/^[a-f0-9]{64}$/);
      expect(() => execFileSync(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' })).toThrow();
      expect(await readFile(join(output, 'source-architecture.json'), 'utf8')).toBe(saved);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
