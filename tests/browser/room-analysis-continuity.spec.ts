import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const width of [1440, 390]) test(`rooms imported in 3D remain derived and become editable in 2D at ${width}px`, async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-3d', 'first-export'])));
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  plan.floors[0].rooms = []; // Import geometry without pre-saved room metadata.
  await page.goto('/editor');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('region', { name: '3D floor plan viewer' })).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'inferred-room.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
  await expect(page.getByRole('application')).toHaveCount(0);
  if (width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('button', { name: 'Area Summary', exact: true }).click();
  const summary = page.getByRole('dialog', { name: 'Area Summary', exact: true });
  await expect(summary).toContainText('Room 1');
  await expect(summary).toContainText('24.0 m²');
  await page.getByRole('button', { name: 'Close area summary', exact: true }).click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: 'Select room Room 1', exact: true }).click();
  const name = page.locator('[data-plan-properties]').getByRole('textbox', { name: 'Room Name', exact: true });
  await expect(name).toHaveValue('Room 1');

  async function exportedFloor() {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).floors[0];
  }
  expect((await exportedFloor()).rooms).toEqual([]);
  await name.fill('Reviewed kitchen'); await name.press('Tab');
  const edited = await exportedFloor();
  expect(edited.rooms).toHaveLength(1);
  expect(edited.rooms[0]).toMatchObject({ name: 'Reviewed kitchen', area: 24.01 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(name).toHaveValue('Room 1');
  expect((await exportedFloor()).rooms).toEqual([]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(name).toHaveValue('Reviewed kitchen');
  const restored = await exportedFloor();
  expect(restored.rooms).toEqual(edited.rooms);
  for (const key of ['walls', 'doors', 'windows', 'furniture']) expect(restored[key]).toEqual(edited[key]);
  expect(errors).toEqual([]);
});
