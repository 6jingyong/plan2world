import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildBareHouse } from '$lib/plan2world/bareHouse';
import { assemblePlan2WorldDraft } from '$lib/plan2world/reconstructionAssembly';

const loadJson = (relativePath: string) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

it('reconstructs fresh case01 evidence through deterministic normalization and assembly', () => {
  const trace = loadJson('./fixtures/real-floorplans/fresh/01-decorated-yj215/wall-trace.json');
  const annotations = loadJson('./fixtures/real-floorplans/fresh/01-decorated-yj215/source-annotation.json');

  const bareHouse = buildBareHouse(trace);
  const draft = assemblePlan2WorldDraft(bareHouse, annotations, { sourceWidthPx: 1536, sourceHeightPx: 1026 });
  const floor = draft.floors[0];

  expect(bareHouse.schemaVersion).toBe('bare-house-v1');
  expect(bareHouse.sourceSchemaVersion).toBe('source-wall-trace-v1');
  expect(bareHouse.walls.length).toBeGreaterThanOrEqual(trace.walls.length);
  expect(draft.scale).toMatchObject({ mode: 'measured', confidence: 0.95 });
  expect(draft.sourceRegistration?.anchors.length).toBeGreaterThanOrEqual(2);
  expect(floor.doors).toHaveLength(10);
  expect(floor.windows).toHaveLength(8);
  expect(floor.furniture).toHaveLength(30);

  const warningAssumptions = (draft.assumptions ?? []).filter(item => item.startsWith('Opening '));
  expect(warningAssumptions).toEqual([]);

  const wallIds = new Set(floor.walls.map(wall => wall.id));
  for (const opening of [...(floor.doors ?? []), ...(floor.windows ?? [])]) {
    expect(wallIds.has(opening.wallId)).toBe(true);
    expect(opening.width).toBeGreaterThan(0);
    expect(opening.position).toBeGreaterThanOrEqual(0);
    expect(opening.position).toBeLessThanOrEqual(1);
  }
});
