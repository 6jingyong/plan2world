import { expect, it } from 'vitest';
import { parsePlan2WorldDraft } from '$lib/plan2world/draftContract';
import { validatedDraftToProject } from '$lib/plan2world/draftConverter';
import { draftToProject } from '$lib/plan2world/draft';

function rectangleDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Boundary test',
    units: 'cm',
    scale: { mode: 'provided', confidence: 1 },
    floors: [{
      id: 'floor-0', name: 'Ground Floor', level: 0,
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, kind: 'exterior' },
        { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, kind: 'exterior' },
        { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, kind: 'exterior' },
        { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, kind: 'exterior' },
      ],
      doors: [{ id: 'd1', wallId: 'w4', position: 0.5, width: 90 }],
      windows: [], furniture: [],
    }],
  } as const;
}

it('lets a frozen validated draft enter conversion without reparsing unknown input', () => {
  const now = new Date('2026-10-19T06:00:00Z');
  const parsed = parsePlan2WorldDraft(rectangleDraft());
  const direct = validatedDraftToProject(parsed, now);
  const compatibility = draftToProject(rectangleDraft(), now);

  expect(direct).toEqual(compatibility);
  expect(direct.floors[0].doors[0]).toMatchObject({ id: 'd1', wallId: 'w4', width: 90 });
});

it('keeps contract failures on the validation side of the converter boundary', () => {
  const invalid = rectangleDraft();
  const copy = structuredClone(invalid) as any;
  copy.floors[0].doors[0].wallId = 'missing-wall';
  expect(() => parsePlan2WorldDraft(copy)).toThrow('references unknown wall');
});
