import { test, expect } from '@playwright/test';
import { sourceEvaluationHtml } from '../../tooling/source-evaluation-html.mjs';
import { createDefaultProject } from '../../src/lib/models/projectDefaults';
import { evaluateSourceCorrection } from '../../src/lib/plan2world/sourceEvaluation';

test('offline source report switches original/before/after without network or script errors', async ({ page }) => {
  const project = createDefaultProject('Synthetic report');
  project.floors[0].backgroundImage = { dataUrl: 'data:image/png;base64,aA==', position: { x: 50, y: 50 }, scale: 1, rotation: 0, opacity: .5, locked: true };
  project.floors[0].walls = [{ id: 'wall', start: { x: 10, y: 10 }, end: { x: 90, y: 10 }, thickness: 12, height: 280, color: '#eee' }];
  const source = { sha256: 'a'.repeat(64), resultSha256: 'b'.repeat(64), width: 100, height: 100 };
  const report = evaluateSourceCorrection({ project, source });
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  const image = { dataUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'), width: 100, height: 100 };
  await page.setContent(sourceEvaluationHtml({ source: image, before: { project, report }, after: { project, report } }));
  await expect(page.locator('#plan polyline')).toHaveCount(1);
  await page.getByRole('button', { name: '原图', exact: true }).click();
  await expect(page.locator('#plan polyline')).toHaveCount(0);
  await expect(page.locator('#summary')).toBeEmpty();
  for (const name of ['改造前叠图', '改造后叠图']) {
    await page.getByRole('button', { name }).click();
    await expect(page.locator('#plan polyline')).toHaveCount(1);
    await expect(page.locator('#summary')).toContainText('not_run');
  }
  expect(errors).toEqual([]);expect(network).toEqual([]);
});
