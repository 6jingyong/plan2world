import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

for (const target of ['wall', 'empty space'] as const) {
  test(`3D selection of ${target} replaces the previous 2D multi-selection`, async ({ page }) => {
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
    // Compare against the imported project, including normalized opening defaults.
    const original = await exportedFloor();
    expect(original.walls).toHaveLength(4);
    await page.getByRole('button', { name: 'Save', exact: true }).press('ControlOrMeta+a');
    await expect(page.getByRole('application').getByText('6 selected', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '3D', exact: true }).click();
    const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
    await expect(viewer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Edit Mode', exact: true }).click();
    const canvas = viewer.locator('canvas').last();
    const bounds = (await canvas.boundingBox())!;
    // The same fixture/view used by viewer-invalidation: this point hits a wall.
    // An outer corner of the viewer misses the fitted plan entirely.
    await canvas.click({ position: target === 'wall'
      ? { x: bounds.width * 0.4, y: bounds.height * 0.6 }
      : { x: bounds.width - 10, y: bounds.height - 10 } });
    const length = page.getByRole('textbox', { name: 'Length (cm)', exact: true });
    if (target === 'wall') await expect(length).toBeVisible();
    else await expect(length).toBeHidden();

    await page.getByRole('button', { name: '2D', exact: true }).click();
    await expect(page.getByRole('application').getByText('6 selected', { exact: true })).toBeHidden();
    if (target === 'wall') await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();
    else await expect(page.locator('[data-quick-geometry-toolbar]')).toBeHidden();

    // Delete must act on exactly the new selection, never the old six items.
    await page.getByRole('button', { name: 'Save', exact: true }).press('Delete');
    const after = await exportedFloor();
    if (target === 'wall') {
      expect(after.walls).toHaveLength(3);
      const removed = original.walls.filter((wall: { id: string }) => !after.walls.some((item: { id: string }) => item.id === wall.id));
      expect(removed).toHaveLength(1);
      expect(after.walls).toEqual(original.walls.filter((wall: { id: string }) => wall.id !== removed[0].id));
      for (const kind of ['doors', 'windows']) {
        expect(after[kind]).toEqual(original[kind].filter((opening: { wallId: string }) => opening.wallId !== removed[0].id));
      }
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      const restored = await exportedFloor();
      for (const kind of ['walls', 'doors', 'windows']) expect(restored[kind]).toEqual(original[kind]);
    } else {
      for (const kind of ['walls', 'doors', 'windows']) expect(after[kind]).toEqual(original[kind]);
    }
  });
}

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
