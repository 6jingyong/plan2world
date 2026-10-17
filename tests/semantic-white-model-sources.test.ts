import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { summarizePlan2WorldDraft } from '$lib/plan2world/review';
import { sourceBackgroundForRegistration } from '$lib/plan2world/sourceBackground';
import { readProject } from '$lib/utils/projectValidation';

const root = 'tests/fixtures/real-floorplans/white-model-skill-v1';
const run = JSON.parse(readFileSync(`${root}/run.json`, 'utf8'));

// Regression fixtures from actual Skill applications, not a source-accuracy score.
for (const sample of run.samples) it(`${sample.sampleId}: fresh Skill draft survives the native import/save pipeline`, () => {
  const draft = parsePlan2WorldDraft(JSON.parse(readFileSync(`${root}/${sample.sampleId}/draft.json`, 'utf8')));
  expect(draft.presentation).toBe('semantic-white-model');
  expect(summarizePlan2WorldDraft(draft).geometryErrorCount).toBe(0);
  const source = { ...sample.source, dataUrl: 'data:image/jpeg;base64,AA==' };
  expect(sourceBackgroundForRegistration(draft, source, draft.sourceRegistration!)).toBeTruthy();
  const project = readProject(JSON.parse(JSON.stringify(draftToProject(draft))));
  expect(project.floors.flatMap(f => f.furniture)).toHaveLength(sample.counts.furnitureCount);
  for (const floor of project.floors) for (const item of floor.furniture) {
    expect(item.sourceCategory?.trim()).toBeTruthy();
    expect(item.width).toBeGreaterThan(0); expect(item.depth).toBeGreaterThan(0); expect(item.height).toBeGreaterThan(0);
  }
  if (sample.sampleId === 'curved-lianjia') expect(project.floors[0].walls.some(wall => wall.curvePoint)).toBe(true);
});
