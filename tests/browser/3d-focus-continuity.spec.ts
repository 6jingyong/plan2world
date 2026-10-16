import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('primary geometry focus survives 2D to 3D verification and back', async ({ page }) => {
  await page.goto('/editor');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('tests/fixtures/connected-dimensions.openplan.json'));
  // Close the export popover and expose Layers without relying on pointer coordinates.
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');

  await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
  const length = page.getByRole('textbox', { name: 'Length (cm)', exact: true });
  await expect(length).toHaveValue('600.5');
  await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('region', { name: '3D floor plan viewer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });

  // The same canonical primary selection remains available to the 3D viewer and inspector.
  await expect(length).toHaveValue('600.5');

  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();
  await expect(length).toHaveValue('600.5');
});
