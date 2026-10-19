import { expect, it } from 'vitest';
import { parsePlan2WorldDraft, Plan2WorldDraftError } from '$lib/plan2world/draftContract';
import { validatedDraftToProject } from '$lib/plan2world/draftConverter';

function draftWithOpening(wallIds = ['s1', 's2', 's3', 's4']) {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Floor opening test',
    units: 'cm',
    scale: { mode: 'provided', confidence: 1 },
    floors: [{
      id: 'f0', name: 'Ground Floor', level: 0,
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
        { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
        { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 } },
        { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
        { id: 's1', start: { x: 600, y: 0 }, end: { x: 700, y: 0 } },
        { id: 's2', start: { x: 700, y: 0 }, end: { x: 700, y: 100 } },
        { id: 's3', start: { x: 700, y: 100 }, end: { x: 600, y: 100 } },
        { id: 's4', start: { x: 600, y: 100 }, end: { x: 600, y: 0 } },
      ],
      doors: [], windows: [], furniture: [],
      floorOpenings: [{ id: 'shaft-1', name: 'Service shaft', wallIds, confidence: 0.9 }],
    }],
  };
}

it('maps an exact wall-backed floor opening onto the detected native room', () => {
  const draft = parsePlan2WorldDraft(draftWithOpening());
  const project = validatedDraftToProject(draft, new Date('2026-10-19T07:00:00Z'));
  const opening = project.floors[0].rooms.find(room => room.id === 'shaft-1');
  expect(opening).toMatchObject({ name: 'Service shaft', floorOpening: true, area: 0 });
  expect(new Set(opening?.walls)).toEqual(new Set(['s1', 's2', 's3', 's4']));
  expect(project.reconstruction?.floors[0].floorOpenings).toEqual([{ id: 'shaft-1', confidence: 0.9 }]);
});

it('rejects duplicate and unknown wall references at the draft boundary', () => {
  expect(() => parsePlan2WorldDraft(draftWithOpening(['s1', 's2', 's2']))).toThrow(/wallIds must be unique/);
  expect(() => parsePlan2WorldDraft(draftWithOpening(['s1', 's2', 'missing']))).toThrow(/references unknown wall missing/);
});

it('fails conversion instead of guessing when a floor opening does not exactly match a room', () => {
  const draft = parsePlan2WorldDraft(draftWithOpening(['s1', 's2', 's3']));
  expect(() => validatedDraftToProject(draft, new Date('2026-10-19T07:00:00Z')))
    .toThrow(Plan2WorldDraftError);
  expect(() => validatedDraftToProject(draft, new Date('2026-10-19T07:00:00Z')))
    .toThrow(/must match exactly one enclosed wall-derived room/);
});
