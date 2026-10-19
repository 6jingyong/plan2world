import { describe, expect, it } from 'vitest';
import { buildBareHouse, SOURCE_WALL_TRACE_VERSION } from '$lib/plan2world/bareHouse';
import { assemblePlan2WorldDraft, SOURCE_ANNOTATION_VERSION } from '$lib/plan2world/reconstructionAssembly';

function bareHouse() {
  return buildBareHouse({
    schemaVersion: SOURCE_WALL_TRACE_VERSION,
    walls: [
      { id: 'top', start: { x: 10, y: 20 }, end: { x: 110, y: 20 } },
      { id: 'right', start: { x: 110, y: 20 }, end: { x: 110, y: 120 } },
      { id: 'bottom', start: { x: 110, y: 120 }, end: { x: 10, y: 120 } },
      { id: 'left', start: { x: 10, y: 120 }, end: { x: 10, y: 20 } },
    ],
  });
}

function annotations(): any {
  return {
    schemaVersion: SOURCE_ANNOTATION_VERSION,
    scaleEvidence: {
      mode: 'measured', realLengthCm: 200,
      endpoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      confidence: 0.95, basis: 'Visible 200 cm dimension spanning 100 source pixels',
    },
    openings: [{
      id: 'd1', kind: 'door',
      endpoints: [{ x: 40, y: 120 }, { x: 70, y: 120 }],
      evidence: 'Visible jamb-to-jamb opening',
      doorType: 'single', typeEvidence: 'One hinged leaf arc',
    }],
    furniture: [{ id: 'sofa-1', sourceCategory: 'sofa', position: { x: 60, y: 70 } }],
  };
}

describe('deterministic reconstruction assembly', () => {
  it('turns source evidence into cm draft geometry and resolves opening hosts', () => {
    const result = assemblePlan2WorldDraft(bareHouse(), annotations(), { sourceWidthPx: 200, sourceHeightPx: 200 });
    const floor = result.floors[0];
    expect(result.scale).toEqual({ mode: 'measured', confidence: 0.95, basis: 'Visible 200 cm dimension spanning 100 source pixels' });
    expect(floor.walls[0].start).toEqual({ x: 0, y: 0 });
    expect(floor.walls[0].end).toEqual({ x: 200, y: 0 });
    expect(floor.doors?.[0]).toMatchObject({ wallId: 'bottom', width: 60 });
    expect(floor.doors?.[0].position).toBeCloseTo(0.55);
    expect(floor.furniture?.[0]).toMatchObject({
      id: 'sofa-1', catalogId: 'imported_object', sourceCategory: 'sofa', position: { x: 100, y: 100 },
    });
    expect(result.sourceRegistration?.floorId).toBe('floor-0');
    expect(result.sourceRegistration?.anchors).toHaveLength(4);
    expect(result.sourceRegistration?.anchors[0]).toEqual({ wallId: 'top', endpoint: 'start', image: { x: 0.05, y: 0.1 } });
  });

  it('rejects LLM-owned derived geometry and host fields', () => {
    const input = annotations();
    input.openings[0].wallId = 'bottom';
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: wallId/);

    delete input.openings[0].wallId;
    input.openings[0].width = 90;
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: width/);

    delete input.openings[0].width;
    input.scaleEvidence.cmPerPixel = 2;
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/unsupported fields: cmPerPixel/);
  });

  it('rejects incomplete deterministic source-registration context', () => {
    expect(() => assemblePlan2WorldDraft(bareHouse(), annotations(), { sourceWidthPx: 200 })).toThrow(/requires both/);
  });

  it('rejects furniture outside the fixed vocabulary before draft assembly', () => {
    const input = annotations();
    input.furniture[0].sourceCategory = 'bay_window';
    expect(() => assemblePlan2WorldDraft(bareHouse(), input)).toThrow(/not in plan2world-furniture-v1/);
  });
});
