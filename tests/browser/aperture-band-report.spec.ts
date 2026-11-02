import { test, expect } from '@playwright/test';
import { apertureBandHtml } from '../../tooling/aperture-band-html.mjs';

test('local aperture report keeps source/candidates selectable and never accepts geometry', async ({ page }) => {
  const points = [{ x: 80, y: 50 }, { x: 140, y: 50 }];
  const band = { low: -10, high: 10, jambPositionsPx: [-5, 65], interpretation: 'one-face-recorded', style: 'outlined', midpointResidualPx: 0,
    wallRelations: [{ sourcePath: 'walls[0]', relation: 'lower-face' }], polygon: [{ x: 60, y: 40 }, { x: 160, y: 40 }, { x: 160, y: 60 }, { x: 60, y: 60 }] };
  const review = { limitation: 'Unapproved diagnostic only.', audits: [
    { sourcePath: 'openings[0]', label: 'Synthetic window', status: 'unapproved-wall-band', existingHostStatus: 'unresolved', endpoints: points, candidates: [band], thresholds: [] },
    { sourcePath: 'openings[1]', label: '</script><script>throw Error("injected")</script>', status: 'invalid-observation', reason: 'Invalid kind', candidates: [], thresholds: [] },
  ] };
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  const dataUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="white"/></svg>');
  await page.setContent(apertureBandHtml({ source: { dataUrl, width: 200, height: 100 }, observations: { walls: [] }, review }));
  await expect(page.locator('#status')).toContainText('unapproved-wall-band');
  const overlay = await page.locator('#detail').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole('button', { name: '仅原图' }).click();
  expect(await page.locator('#detail').evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(overlay);
  await page.getByRole('button', { name: '显示观察与未应用候选' }).click();
  expect(await page.locator('#detail').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(overlay);
  await page.locator('#opening').selectOption('1');await expect(page.locator('#reason')).toContainText('Invalid kind');
  await page.locator('#opening').selectOption('0');await expect(page.locator('#metrics')).toContainText('框边相对原两端偏移');
  expect(errors).toEqual([]);expect(network).toEqual([]);
  await expect(page.getByRole('button', { name: /确认|应用几何|接受/ })).toHaveCount(0);
});
