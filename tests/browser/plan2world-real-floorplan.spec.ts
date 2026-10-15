import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const fixture = resolve('tests/fixtures/real-floorplans/wikimedia-two-bedroom.json');

test('real floor-plan baseline imports into the editor and renders in 3D', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/editor');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(fixture);

  const app = page.getByRole('application');
  await expect(app).toContainText('18 walls');
  await expect(app).toContainText('10 doors');
  await expect(app).toContainText('7 windows');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
  await expect(viewer.locator('canvas').first()).toBeVisible();
  await expect(viewer.locator('canvas').first()).toHaveAttribute('data-rendered', 'true');
  await testInfo.attach('real-floorplan-3d', { body: await page.screenshot(), contentType: 'image/png' });

  expect(errors).toEqual([]);
});
