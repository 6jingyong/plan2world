import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const width of [1440, 390]) test(`saved reconstruction Review follows corrections and keeps image alignment at ${width}px`, async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-3d', 'first-export', 'first-door'])));
  await page.goto('/editor');
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  plan.id = 'qa-persistent-review'; plan.name = 'QA Persistent Review';
  const floor = plan.floors[0]; floor.doors[0].width = 800;
  plan.reconstruction = { version: 1, scale: { mode: 'estimated', confidence: 0.45, basis: 'Synthetic scale assumption' },
    assumptions: ['Check this source against a measured dimension.'], floors: [{ floorId: floor.id,
      walls: floor.walls.map((wall: any) => ({ id: wall.id, kind: 'exterior', confidence: 0.4 })),
      doors: floor.doors.map((door: any) => ({ id: door.id, confidence: 0.3 })),
      windows: floor.windows.map((window: any) => ({ id: window.id, confidence: 0.7 })),
    }] };
  // Synthetic source raster, independent of app state; fixed 1 cm/pixel registration.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, 800, 600);
    context.strokeStyle = '#111'; context.strokeRect(100, 100, 600, 400); return canvas.toDataURL();
  });
  floor.backgroundImage = { dataUrl, position: { x: 300, y: 200 }, scale: 1, rotation: 0, opacity: 0.35, locked: true,
    reconstructionSource: { width: 800, height: 600, name: 'synthetic-source.png', registration: 'bounds' } };
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
  await page.reload(); // Begin from the saved project, with no in-memory import draft.

  const dialog = page.getByRole('dialog', { name: 'Review reconstruction', exact: true });
  async function openReview() {
    if (width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('button', { name: 'Review reconstruction', exact: true }).click();
    await expect(dialog).toBeVisible();
  }
  const closeReview = () => dialog.getByRole('button', { name: 'Close reconstruction review', exact: true }).click();
  const finding = () => dialog.getByRole('button', { name: /qa-door extends beyond its host wall qa-wall-0/ });
  const path = () => dialog.locator('svg[aria-label="Current geometry trace"] path').first();
  await openReview();
  await expect(dialog.getByRole('img', { name: 'Source floor plan', exact: true })).toBeVisible();
  await expect(dialog).toContainText('45% confidence');
  await expect(dialog).toContainText('Synthetic scale assumption');
  await expect(dialog).toContainText(plan.reconstruction.assumptions[0]);
  await expect(path()).toHaveAttribute('d', 'M 100 100 L 700.5 100');
  await finding().click();
  await dialog.getByRole('button', { name: 'Edit finding in plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Review must land on a single editable target even when its finding also names the host wall.
  await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();
  const doorWidth = page.locator('[data-quick-opening-width]');
  await expect(doorWidth).toHaveValue('800');
  await doorWidth.fill('90'); await doorWidth.press('Enter');
  await openReview(); await expect(finding()).toHaveCount(0); await closeReview();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await openReview(); await expect(finding()).toBeVisible(); await closeReview();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
  const length = page.locator('[data-quick-wall-length]');
  await length.fill('500.5'); await length.press('Enter');
  await openReview();
  await expect(path()).toHaveAttribute('d', 'M 100 100 L 600.5 100');
  await expect(finding()).toHaveCount(0);
  await closeReview();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
  await page.reload();
  await openReview();
  await expect(path()).toHaveAttribute('d', 'M 100 100 L 600.5 100');
  await expect(dialog).toContainText(plan.reconstruction.assumptions[0]);
  await expect(finding()).toHaveCount(0);
  await closeReview();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const restored = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(restored.reconstruction).toEqual(plan.reconstruction);
  expect(restored.floors[0].backgroundImage).toEqual(floor.backgroundImage);
  expect(restored.floors[0].doors[0].width).toBe(90);
  expect(restored.floors[0].walls[0].end.x).toBe(500.5);
  expect(errors).toEqual([]);
});
