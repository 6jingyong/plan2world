import { describe, expect, it } from 'vitest';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';
import { createWalkthroughCollisionWorld } from '$lib/utils/walkthroughCollision';
import { parseFunctionalZones } from '$lib/plan2world/functionalZones';

const p = (x: number, y: number) => ({ x, y });
const decision = { decision: 'accept', evidence: 'Synthetic observed feature.', decisionBasis: 'Visible source support.' };
const wall = (label: string, x: number, y: number, a: number, b: number) => ({ label, ...decision, start: p(x, y), end: p(a, b) });
const entry = { ...decision, label: 'entry', kind: 'door', doorType: 'single', typeEvidence: 'One hinged leaf.', endpoints: [p(20, 70), p(20, 90)] };
const zone = (label: string, seed: number[], boundary: [number, number, string][], environment = 'indoor') => ({ ...decision,
  label, category: label, environment, position: p(seed[0], seed[1]), boundary: boundary.map(([x, y, kind]) => ({ point: p(x, y), kind, evidence: 'Synthetic source edge/threshold.' })) });
const outer = () => [wall('n', 20, 20, 180, 20), wall('e', 180, 20, 180, 180), wall('s', 180, 180, 20, 180), wall('w', 20, 180, 20, 20)];
const architecture = () => ({ schemaVersion: 'source-architecture-v1', walls: outer(), openings: [entry],
  scaleEvidence: { kind: 'estimated_reference', realLengthCm: 100, endpoints: [p(20, 20), p(30, 20)], evidence: 'Provisional scale.' },
  functionalZones: [zone('bedroom', [60, 110], [[20, 20, 'wall'], [100, 20, 'wall'], [100, 180, 'wall'], [20, 180, 'wall']]),
    zone('dressing', [140, 110], [[100, 20, 'wall'], [180, 20, 'wall'], [180, 180, 'wall'], [100, 180, 'wall']])] });
const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: [{ sourceCategory: 'bed', position: p(60, 110) }] };
const context = { sourceWidthPx: 200, sourceHeightPx: 200 };

it('uses functional separation to close a wall even when all existing furniture is already enclosed', () => {
  const input = architecture(); input.walls.push(wall('divider', 100, 20, 100, 176));
  input.openings.push({ ...entry, label: 'divider door', endpoints: [p(100, 70), p(100, 90)] });
  const before = JSON.stringify(input), stage = prepareArchitectureStage(input, context, furnishing);
  expect(stage.functionalZoneReview?.initialMetrics.closedAnchors).toEqual([true]);
  expect(stage.functionalZoneReview?.initialMetrics.resolvedZoneCount).toBe(0);
  expect(stage.functionalZoneReview?.finalMetrics.resolvedZoneCount).toBe(2);
  expect(stage.functionalZoneReview?.accepted).toHaveLength(1);
  expect(stage.bareHouse.walls.find(w => w.id === 'w5')?.end).toEqual(p(100, 180));
  expect(stage.centerlinePolicy).toBe('disabled');
  expect(JSON.stringify(input)).toBe(before);
});

it('closes independent doorless functional zones with one shared logical host and no door leaf', () => {
  const input = architecture(); input.walls.push(wall('divider upper', 100, 20, 100, 70), wall('divider lower', 100, 90, 100, 180));
  input.functionalZones[0].boundary.splice(2, 0, { point: p(100, 70), kind: 'passage', evidence: 'Visible partition ends.' }, { point: p(100, 90), kind: 'wall', evidence: 'Lower partition.' });
  input.functionalZones[1].boundary.push({ point: p(100, 90), kind: 'passage', evidence: 'Same threshold, reverse direction.' }, { point: p(100, 70), kind: 'wall', evidence: 'Upper partition.' });
  const before = JSON.stringify(input), stage = prepareArchitectureStage(input, context, furnishing);
  const result = assembleFrozenArchitecture(stage, furnishing), native = draftToProject(result.draft);
  expect(stage.functionalZoneReview?.finalMetrics.resolvedZoneCount).toBe(2);
  const passage = result.draft.floors[0].doors!.filter(d => d.type === 'opening');
  expect(passage).toHaveLength(1);
  expect(passage[0]).toMatchObject({ width: 200, height: 280 });
  const host = passage[0].wallId;
  expect(createWalkthroughCollisionWorld(native.floors[0]).obstacles.some(o => o.id.startsWith(`wall:${host}:`))).toBe(false);
  expect(native.floors[0].rooms.map(r => r.name).sort()).toEqual(['bedroom', 'dressing']);
  expect(JSON.stringify(input)).toBe(before);
  const stored = JSON.stringify(result.draft);
  expect(JSON.stringify(parsePlan2WorldDraft(JSON.parse(stored)))).toBe(stored);
  const scaled = calibratePlan2WorldDraft(result.draft, 100, 150);
  expect(scaled.floors[0].functionalZones![0].position.x).toBe(result.draft.floors[0].functionalZones![0].position.x * 1.5);
  expect(scaled.floors[0].doors![0].height).toBe(280);
});

it('evaluates two jointly necessary endpoint connections without furniture or another model call', () => {
  const input = architecture(); input.walls.push(wall('divider', 100, 24, 100, 176));
  input.openings.push({ ...entry, label: 'divider door', endpoints: [p(100, 70), p(100, 90)] });
  const stage = prepareArchitectureStage(input, context, { schemaVersion: 'source-furnishing-v1', furniture: [] });
  expect(stage.functionalZoneReview?.initialMetrics.resolvedZoneCount).toBe(0);
  expect(stage.functionalZoneReview?.finalMetrics.resolvedZoneCount).toBe(2);
  expect(stage.functionalZoneReview?.accepted[0].moves).toHaveLength(2);
  expect(stage.functionalZoneReview?.llmCalls).toBe(0);
});

it('continues a supported run into a T-junction without dragging its non-collinear neighbour', () => {
  const input = architecture();
  input.walls.push(wall('horizontal divider', 20, 100, 176, 100), wall('existing return', 176, 100, 176, 140));
  input.functionalZones = [zone('upper', [80, 60], [[20, 20, 'wall'], [180, 20, 'wall'], [180, 100, 'wall'], [20, 100, 'wall']]),
    zone('lower', [80, 150], [[20, 100, 'wall'], [180, 100, 'wall'], [180, 180, 'wall'], [20, 180, 'wall']])];
  const stage = prepareArchitectureStage(input, context, furnishing);
  expect(stage.functionalZoneReview?.finalMetrics.resolvedZoneCount).toBe(2);
  expect(stage.bareHouse.walls.find(w => w.id === 'w6')?.start).toEqual(p(176, 100));
  expect(stage.functionalZoneReview?.accepted).toHaveLength(1);
});

it('closes an unfurnished balcony using invisible air boundaries and an editable low railing', () => {
  const input = architecture(); input.walls = [wall('shared facade', 20, 60, 180, 60), wall('e', 180, 60, 180, 180), wall('s', 180, 180, 20, 180), wall('w', 20, 180, 20, 60)];
  input.openings = [{ ...entry, label: 'balcony sliding door', doorType: 'sliding', typeEvidence: 'Visible sliding track.', endpoints: [p(70, 60), p(130, 60)] }];
  input.functionalZones = [zone('living', [80, 110], [[20, 60, 'wall'], [180, 60, 'wall'], [180, 180, 'wall'], [20, 180, 'wall']]),
    zone('balcony', [90, 40], [[20, 20, 'air'], [180, 20, 'railing'], [180, 60, 'wall'], [20, 60, 'air']], 'balcony')];
  const stage = prepareArchitectureStage(input, context, furnishing), draft = assembleFrozenArchitecture(stage, furnishing).draft;
  expect(stage.functionalZoneReview?.finalMetrics.resolvedZoneCount).toBe(2);
  const air = draft.floors[0].walls.filter(w => w.boundaryType === 'air'), rail = draft.floors[0].walls.find(w => w.boundaryType === 'railing')!;
  expect(air).toHaveLength(2); expect(rail.height).toBe(110);
  const floor = draftToProject(draft).floors[0];
  expect(floor.rooms.find(r => r.name === 'balcony')?.roomType).toBe('outdoor');
  expect(createWalkthroughCollisionWorld(floor).obstacles.some(o => o.id.startsWith(`wall:${air[0].id}:`))).toBe(true);
  expect(draft.floors[0].doors![0].height).toBe(280);
});

it('does not invent solid walls from an unsupported functional outline', () => {
  const input = architecture();
  const stage = prepareArchitectureStage(input, context, furnishing);
  expect(stage.bareHouse.walls).toHaveLength(4);
  expect(stage.functionalZoneReview?.finalMetrics.resolvedZoneCount).toBe(0);
});

it('will not turn a source window into a traversable functional threshold', () => {
  const input: any = architecture(); input.walls.push(wall('divider', 100, 20, 100, 180));
  input.openings.push({ ...decision, label: 'glass', kind: 'window', endpoints: [p(100, 70), p(100, 90)] });
  input.functionalZones[0].boundary.splice(2, 0, { point: p(100, 70), kind: 'passage', evidence: 'Conflicting source interpretation.' }, { point: p(100, 90), kind: 'wall', evidence: 'Partition.' });
  const stage = prepareArchitectureStage(input, context, furnishing);
  expect(stage.functionalZoneReview?.boundaryChanges.some(x => x.status === 'passage-conflicts-with-observed-window')).toBe(true);
  expect(stage.architectureDraft.floors[0].windows).toHaveLength(1);
  expect(stage.architectureDraft.floors[0].doors).toHaveLength(1);
});

it('does not widen a known door to match an oversized functional passage', () => {
  const input = architecture(); input.walls.push(wall('divider', 100, 20, 100, 180));
  input.openings.push({ ...entry, label: 'small door', endpoints: [p(100, 70), p(100, 90)] });
  input.functionalZones[0].boundary.splice(2, 0, { point: p(100, 50), kind: 'passage', evidence: 'Oversized interpretation.' }, { point: p(100, 100), kind: 'wall', evidence: 'Partition.' });
  const stage = prepareArchitectureStage(input, context, furnishing);
  expect(stage.functionalZoneReview?.boundaryChanges.some(x => x.status === 'observed-door-extent-takes-precedence')).toBe(true);
  expect(stage.architectureDraft.floors[0].doors![1].width).toBe(200);
});

it('preserves uncertain functional zones and rejects model-authored geometry IDs', () => {
  const input = architecture(); input.functionalZones[1].decision = 'uncertain';
  const stage = prepareArchitectureStage(input, context, furnishing);
  expect(stage.architecture.functionalZones).toHaveLength(2);
  expect(stage.functionalZoneReview?.acceptedZoneCount).toBe(1);
  const invalid: any = structuredClone(input.functionalZones); invalid[0].boundary[0].wallId = 'invented';
  expect(() => parseFunctionalZones(invalid)).toThrow(/unsupported fields/);
  const outside: any = architecture(); outside.functionalZones[0].boundary[0].point.x = -1;
  expect(() => prepareArchitectureStage(outside, context, furnishing)).toThrow();
});
