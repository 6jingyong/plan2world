import { describe, expect, it } from 'vitest';
import { inspectPlan2WorldDraftGeometry } from '$lib/plan2world/geometryHealth';

function draft(walls: any[], doors: any[] = [], windows: any[] = []) {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Health check plan',
    units: 'cm',
    scale: { mode: 'measured', confidence: 0.95, basis: 'dimensioned drawing' },
    floors: [{ id: 'floor-0', name: 'Ground Floor', level: 0, walls, doors, windows, furniture: [] }],
  };
}

const rectangle = [
  { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
  { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
  { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 } },
  { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
];

describe('Plan2World geometry health', () => {
  it('does not invent issues for a clean connected room with a valid opening', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft(
      rectangle,
      [{ id: 'd1', wallId: 'w1', position: 0.5, width: 90 }],
      [{ id: 'win1', wallId: 'w3', position: 0.5, width: 120 }],
    ));
    expect(issues).toEqual([]);
  });

  it('flags implausibly short wall fragments', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft([
      ...rectangle,
      { id: 'stub', start: { x: 200, y: 0 }, end: { x: 210, y: 0 } },
    ]));
    expect(issues.some(issue => issue.code === 'short-wall' && issue.elementIds.includes('stub'))).toBe(true);
  });

  it('flags endpoints that stop a few centimetres short of another wall', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft([
      { id: 'horizontal', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
      { id: 'almost', start: { x: 200, y: 7 }, end: { x: 200, y: 200 } },
    ]));
    const issue = issues.find(item => item.code === 'near-miss');
    expect(issue?.elementIds).toEqual(expect.arrayContaining(['horizontal', 'almost']));
    expect(issue?.message).toContain('7.0 cm');
  });

  it('treats a true T-junction as connected instead of a near miss', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft([
      { id: 'horizontal', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
      { id: 'branch', start: { x: 200, y: 0 }, end: { x: 200, y: 200 } },
    ]));
    expect(issues.some(issue => issue.code === 'near-miss')).toBe(false);
    expect(issues.some(issue => issue.code === 'disconnected-component')).toBe(false);
  });

  it('flags exact reversed duplicate wall segments', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft([
      ...rectangle,
      { id: 'duplicate', start: { x: 400, y: 0 }, end: { x: 0, y: 0 } },
    ]));
    expect(issues.some(issue => issue.code === 'duplicate-wall'
      && issue.elementIds.includes('w1') && issue.elementIds.includes('duplicate'))).toBe(true);
  });

  it('flags a smaller disconnected wall group but keeps the largest component as the main plan', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft([
      ...rectangle,
      { id: 'island1', start: { x: 700, y: 0 }, end: { x: 800, y: 0 } },
      { id: 'island2', start: { x: 800, y: 0 }, end: { x: 800, y: 100 } },
    ]));
    const issue = issues.find(item => item.code === 'disconnected-component');
    expect(issue?.elementIds).toEqual(expect.arrayContaining(['island1', 'island2']));
    expect(issue?.elementIds).not.toContain('w1');
  });

  it('flags doors or windows that extend beyond the ends of their host wall', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft(
      rectangle,
      [{ id: 'bad-door', wallId: 'w1', position: 0.05, width: 100 }],
      [{ id: 'bad-window', wallId: 'w2', position: 0.95, width: 80 }],
    ));
    expect(issues.filter(issue => issue.code === 'opening-outside-wall').map(issue => issue.elementIds[0]).sort())
      .toEqual(['bad-door', 'bad-window']);
  });

  it('does not flag a long intentional free-ended partition as short', () => {
    const issues = inspectPlan2WorldDraftGeometry(draft([
      ...rectangle,
      { id: 'partition', start: { x: 200, y: 0 }, end: { x: 200, y: 150 } },
    ]));
    expect(issues.some(issue => issue.code === 'short-wall' && issue.elementIds.includes('partition'))).toBe(false);
  });
});
