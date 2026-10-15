import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

async function importFocusFixture(page: import('@playwright/test').Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('tests/fixtures/top-down-framing.openplan.json'));
  await expect(page).toHaveURL(/id=qa-top-down-framing/, { timeout: 15_000 });
}

test('Review focus opens the requested floor and selection, then consumes the handoff URL', async ({ page }) => {
  await importFocusFixture(page);

  await page.goto('/editor?id=qa-top-down-framing&focusFloor=framing--1&focus=framing--1-wall-0');

  // The fixture normally opens on framing-1. A visible properties panel for a
  // basement-only wall proves the handoff switched floors and selected the target.
  await expect(page.locator('[data-plan-properties]')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/id=qa-top-down-framing/);
  await expect(page).not.toHaveURL(/focusFloor=/);
  await expect(page).not.toHaveURL(/[?&]focus=/);
});
