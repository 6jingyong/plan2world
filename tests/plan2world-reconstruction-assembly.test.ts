import { describe, expect, it } from 'vitest';
import { buildBareHouse, SOURCE_WALL_TRACE_VERSION } from '$lib/plan2world/bareHouse';
import { assemblePlan2WorldDraft, SOURCE_ANNOTATION_VERSION } from '$lib/plan2world/reconstructionAssembly';

function bareHouse() {
  return buildBareHouse({
    schemaVersion: SOURCE_WALL_TRACE_VERSION,
    walls: [
      { start: { x: 10, y: 20 }, end: { x: 110, y: 20 } },
      { start: { x: 110, y: 20 }, end: { x: 110, y: 120 } },
      { start: { x: 110, y: 120 }, end: { x: 10, y: 120 } },
      { start: { x: 10, y: 120 }, end: { x: 10, y: 20 } },
    ],
  });
}

function annotations(): any {
  return {
    schemaVersion: SOURCE_ANNOTATION_VERSION,
    scaleEvidence: {
      kind: 'measured_dimension', realLengthCm: 200,
      endpoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      evidence: 'Visible 200 cm dimension spanning 100 source pixels',
    },
    openings: [{
      kind: 'door', endpoints: [{ x: 40, y: 120 }, { x: 70, y: 120 }],
      evidence: 'Visible jamb-to-jamb opening', doorType: 'single', typeEvidence: 'One hinged leaf arc',
    }],
    furniture: [{ sourceCategory: 'sofa', position: { x: 60, y: 70 } }],
  };
}

describe('deterministic reconstruction assembly', () => {
  it('assigns IDs/confidence, resolves hosts and converts source evidence deterministically', () => {
    const result = assemblePlan2WorldDraft(bareHouse(), annotations(), { sourceWidthPx: 200, sourceHeightPx: 200 });
    const floor = result.floors[0];
    expect(result.scale).toEqual({ mode: 'measured', confidence: 0.95, basis: 'Visible 200 cm dimension spanning 100 source pixels' });
    expect(floor.walls[0]).toMatchObject({ id: 'w1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } });
    expect(floor.doors?.[0]).toMatchObject({ id: 'd1', wallId: 'w3', width: 60 });
    expect(floor.doors?.[0].position).toBeCloseTo(0.55);
    expect(floor.furniture?.[0]).toMatchObject({ id: 'f1', catalogId: 'imported_object', sourceCategory: 'sofa', position: { x: 100, y: 100 } });
    expect(result.sourceRegistration?.floorId).toBe('floor-0');
    expect(result.sourceRegistration?.anchors).toHaveLength(4);
    expect(result.sourceRegistration?.anchors[0]).toEqual({ wallId: 'w1', endpoint: 'start', image: { x: 0.05, y: 0.1 } });
  });

  it('maps scale evidence kinds to fixed final policy', () => {
    const input = annotations();
    input.scaleEvidence.kind = 'estimated_reference';
    const result = assemblePlan2WorldDraft(bareHouse(), input);
    expect(result.scale).toMatchObject({ mode: 'estimated', confidence: 0.5 });
  });

  it('rejects model-authored IDs, confidence and derived geometry', () => {
    const input = annotations();
    input.openings[0].id = 'model-door';
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: id/);

    delete input.openings[0].id;
    input.openings[0].confidence = 0.9;
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: confidence/);

    delete input.openings[0].confidence;
    input.openings[0].wallId = 'w3';
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: wallId/);

    delete input.openings[0].wallId;
    input.openings[0].width = 90;
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: width/);

    delete input.openings[0].width;
    input.scaleEvidence.mode = 'measured';
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: mode/);
  });

  it('rejects incomplete deterministic source-registration context', () => {
    expect(() => assemblePlan2WorldDraft(bareHouse(), annotations(), { sourceWidthPx: 200 })).toThrow(/requires both/);
  });

  it('rejects furniture outside the fixed vocabulary before draft assembly', () => {
    const input = annotations(); input.furniture[0].sourceCategory = 'bay_window';
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/not in plan2world-furniture-v1/);
  });
});


it('writes full-height initial apertures as program defaults, without source height estimates', () => {
  const input = annotations();
  input.openings.push({ kind: 'window', endpoints: [{ x: 40, y: 20 }, { x: 80, y: 20 }], evidence: 'Visible glazing frames' });
  const before = JSON.stringify(input), draft = assemblePlan2WorldDraft(bareHouse(), input);
  expect(draft.floors[0].doors![0].height).toBe(280);
  expect(draft.floors[0].windows![0]).toMatchObject({ height: 280, sillHeight: 0 });
  expect(draft.assumptions?.join(' ')).toContain('editable product defaults are not image measurements');
  expect(JSON.stringify(input)).toBe(before);
});
