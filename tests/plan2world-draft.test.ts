import { expect, it } from 'vitest';
import { draftToProject, parsePlan2WorldDraft, Plan2WorldDraftError } from '$lib/plan2world/draft';

function rectangleDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Test apartment',
    units: 'cm',
    scale: { mode: 'provided', confidence: 1, basis: '400 cm width' },
    assumptions: ['Wall height not shown in source image.'],
    floors: [{
      id: 'floor-0',
      name: 'Ground Floor',
      level: 0,
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, kind: 'exterior' },
        { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, kind: 'exterior' },
        { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, kind: 'exterior' },
        { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, kind: 'exterior' },
      ],
      doors: [{ id: 'd1', wallId: 'w4', position: 0.5, width: 90 }],
      windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 120 }],
      furniture: [],
    }],
  };
}

it('converts a simple draft into the existing editable project model', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const project = draftToProject(rectangleDraft(), now);
  const floor = project.floors[0];

  expect(project.name).toBe('Test apartment');
  expect(project.activeFloorId).toBe('floor-0');
  expect(project.createdAt).toEqual(now);
  expect(project.description).toContain('Scale: provided');
  expect(floor.walls).toHaveLength(4);
  expect(floor.walls[0].height).toBe(280);
  expect(floor.walls[0].thickness).toBe(20);
  expect(floor.doors[0]).toMatchObject({ width: 90, height: 210, type: 'single' });
  expect(floor.windows[0]).toMatchObject({ width: 120, height: 120, sillHeight: 90, type: 'standard' });
  expect(floor.rooms).toHaveLength(1);
  expect(floor.rooms[0].area).toBe(12);
});

it('rejects retired architectural component fields', () => {
  const withComponents: any = rectangleDraft();
  withComponents.floors[0].components = [{ id: 'c1', type: 'shaft', position: { x: 40, y: 40 } }];
  expect(() => parsePlan2WorldDraft(withComponents)).toThrow(/components is retired/);

  const withVocabulary: any = rectangleDraft();
  withVocabulary.componentVocabulary = 'plan2world-components-v2';
  expect(() => parsePlan2WorldDraft(withVocabulary)).toThrow(/componentVocabulary is retired/);
});

it('rejects openings that reference a wall that does not exist', () => {
  const draft = rectangleDraft();
  draft.floors[0].doors[0].wallId = 'missing-wall';

  expect(() => parsePlan2WorldDraft(draft)).toThrow(Plan2WorldDraftError);
  expect(() => parsePlan2WorldDraft(draft)).toThrow(/unknown wall/);
});

it('rejects duplicate wall ids before conversion', () => {
  const draft = rectangleDraft();
  draft.floors[0].walls[1].id = 'w1';

  expect(() => parsePlan2WorldDraft(draft)).toThrow(/duplicate id w1/);
});
