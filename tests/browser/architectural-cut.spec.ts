import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

async function open3D(page: import('@playwright/test').Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('tests/fixtures/top-down-framing.openplan.json'));
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

test('1.20 m architectural cut clips the live 3D canvas and yields to walkthrough', async ({ page }) => {
  await open3D(page);

  const cut = page.getByRole('button', { name: /1\.20 m/ });
  const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').last();

  await expect(cut).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).not.toHaveAttribute('data-architectural-cut', /.+/);

  await cut.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-architectural-cut', '120');

  await page.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true }).click();
  await expect(cut).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).not.toHaveAttribute('data-architectural-cut', /.+/);
});
