import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

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

for (const width of [1440, 390]) test(`Review opening focus keeps its host fixed through dragging and Delete at ${width}px`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-3d', 'first-export', 'first-door'])));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('tests/fixtures/connected-dimensions.openplan.json'));
  await expect(page.getByRole('button', { name: 'QA Connected Dimensions', exact: true })).toBeVisible();
  async function exportedFloor() {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).floors[0];
  }
  const before = await exportedFloor();
  await page.goto('/editor?id=qa-connected-dimensions&focusFloor=dimensions-floor&focus=qa-door&focus=qa-wall-0');
  await expect(page).not.toHaveURL(/focusFloor=/);
  await expect(page.locator('[data-quick-opening-width]')).toHaveValue('90.5');
  await expect(page.getByRole('application').getByText('2 selected', { exact: true })).toHaveCount(0);
  // The full host must still be framed, even though only the opening is selected.
  for (const endpoint of ['A', 'B']) {
    await expect(page.locator(`[data-wall-endpoint-label="${endpoint}"]`)).toBeInViewport({ ratio: 1 });
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const a = (await page.locator('[data-wall-endpoint-label="A"]').boundingBox())!;
  const b = (await page.locator('[data-wall-endpoint-label="B"]').boundingBox())!;
  const startX = (a.x + a.width / 2 + b.x + b.width / 2) / 2;
  const wallY = a.y + a.height * 1.5; // Badge is translated 150% above the endpoint.
  await page.mouse.move(startX, wallY); await page.mouse.down();
  await page.mouse.move(startX + (b.x - a.x) * 0.1, wallY, { steps: 6 }); await page.mouse.up();
  const moved = await exportedFloor();
  expect(moved.doors[0].position).toBeCloseTo(0.6, 2);
  expect(moved.doors[0].width).toBe(before.doors[0].width);
  for (const key of ['walls', 'windows', 'rooms', 'furniture']) expect(moved[key]).toEqual(before[key]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedFloor()).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exportedFloor()).toEqual(moved);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedFloor()).toEqual(before);

  await page.getByRole('button', { name: 'Save', exact: true }).press('Delete');
  const deleted = await exportedFloor();
  expect(deleted.doors).toEqual([]);
  for (const key of ['walls', 'windows', 'rooms', 'furniture']) expect(deleted[key]).toEqual(before[key]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedFloor()).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exportedFloor()).toEqual(deleted);

  // Reopening an obsolete URL after that door is gone must not select its host.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
  await page.goto('/editor?id=qa-connected-dimensions&focusFloor=dimensions-floor&focus=qa-door&focus=qa-wall-0');
  await expect(page).not.toHaveURL(/focusFloor=/);
  await expect(page.locator('[data-quick-geometry-toolbar]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).press('Delete');
  expect(await exportedFloor()).toEqual(deleted);
});
