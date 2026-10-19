import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parsePlan2WorldDraft } from '$lib/plan2world/draftContract';
import { validatedDraftToProject } from '$lib/plan2world/draftConverter';
import { summarizePlan2WorldDraft } from '$lib/plan2world/review';

const fixturePath = 'tests/fixtures/real-floorplans/round2/01-decorated-yj215/draft.json.gz.b64';
const frozenDraft = JSON.parse(gunzipSync(Buffer.from(readFileSync(fixturePath, 'utf8').trim(), 'base64')).toString('utf8'));

it('round2 case01 candidate B passes the draft contract without geometry warnings', () => {
  const draft = parsePlan2WorldDraft(frozenDraft, { requireFurnitureVocabulary: true });
  const summary = summarizePlan2WorldDraft(draft);
  expect(summary).toMatchObject({
    floorCount: 1,
    wallCount: 68,
    doorCount: 15,
    windowCount: 19,
    geometryErrorCount: 0,
    geometryWarningCount: 0,
  });
  expect(draft.floors[0].furniture).toHaveLength(65);
});

it('round2 case01 candidate B converts reproducibly and keeps three balcony rooms', () => {
  const draft = parsePlan2WorldDraft(frozenDraft, { requireFurnitureVocabulary: true });
  const now = new Date('2026-10-19T06:30:00.000Z');
  const a = validatedDraftToProject(draft, now);
  const b = validatedDraftToProject(draft, now);
  expect(a).toEqual(b);

  const floor = a.floors[0];
  expect(floor).toMatchObject({ id: 'f0' });
  expect(floor.walls).toHaveLength(68);
  expect(floor.doors).toHaveLength(15);
  expect(floor.windows).toHaveLength(19);
  expect(floor.furniture).toHaveLength(65);
  expect(floor.rooms).toHaveLength(17);
  expect(floor.rooms.every(room => room.id.startsWith('plan2world-room-f0-'))).toBe(true);

  const hasRoomBoundedBy = (ids: string[]) => floor.rooms.some(room => ids.every(id => room.walls.includes(id)));
  expect(hasRoomBoundedBy(['w06', 'w07', 'bn1', 'bn2'])).toBe(true);
  expect(hasRoomBoundedBy(['w22', 'bs1', 'bs2', 'bs3'])).toBe(true);
  expect(hasRoomBoundedBy(['w24', 'w25', 'bw1', 'bw2', 'bw3', 'bw4'])).toBe(true);
});
