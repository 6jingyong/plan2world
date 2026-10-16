import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('inline correction controls edit wall and opening geometry through the canonical project', async ({ page }) => {
  await page.goto('/editor');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('tests/fixtures/connected-dimensions.openplan.json'));
  // Close the export popover without depending on pointer coordinates.
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');

  const toolbar = page.locator('[data-quick-geometry-toolbar]');

  // Wall: rough correction is already draggable; this toolbar exposes the precise counterpart.
  await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
  await expect(toolbar).toBeVisible();
  await expect(page.locator('[data-wall-endpoint-label="A"]')).toBeVisible();
  await expect(page.locator('[data-wall-endpoint-label="B"]')).toBeVisible();

  const wallLength = page.locator('[data-quick-wall-length]');
  await expect(wallLength).toHaveValue('600.5');
  await page.locator('[data-quick-fixed-endpoint="end"]').click();
  await expect(page.locator('[data-quick-fixed-endpoint="end"]')).toHaveAttribute('aria-pressed', 'true');
  await wallLength.fill('650.5');
  await wallLength.press('Enter');
  await expect(wallLength).toHaveValue('650.5');

  // Door: width and source-wall A offset are available beside the selected opening.
  await page.getByRole('button', { name: /doorway door 1/i }).click();
  const doorWidth = page.locator('[data-quick-opening-width]');
  const doorOffset = page.locator('[data-quick-opening-offset-a]');
  await expect(doorWidth).toHaveValue('90.5');
  await expect(doorOffset).toHaveValue('325.25');
  await doorWidth.fill('100.5');
  await doorWidth.press('Enter');
  await doorOffset.fill('250.25');
  await doorOffset.press('Enter');

  // Window uses the same correction path instead of a second editing system.
  await page.getByRole('button', { name: /standard window 1/i }).click();
  const windowWidth = page.locator('[data-quick-opening-width]');
  const windowOffset = page.locator('[data-quick-opening-offset-a]');
  await expect(windowWidth).toHaveValue('110.25');
  await windowWidth.fill('120.25');
  await windowWidth.press('Enter');
  await windowOffset.fill('175.25');
  await windowOffset.press('Enter');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const project = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  const floor = project.floors[0];

  expect(floor.walls[0].start).toEqual({ x: -50, y: 0 });
  expect(floor.walls[0].end).toEqual({ x: 600.5, y: 0 });
  expect(floor.walls[3].end).toEqual(floor.walls[0].start);

  expect(floor.doors[0].width).toBe(100.5);
  expect(floor.doors[0].position).toBeCloseTo(250.25 / 650.5);

  const windowWall = floor.walls.find((wall: { id: string }) => wall.id === floor.windows[0].wallId);
  const windowWallLength = Math.hypot(
    windowWall.end.x - windowWall.start.x,
    windowWall.end.y - windowWall.start.y,
  );
  expect(floor.windows[0].width).toBe(120.25);
  expect(floor.windows[0].position).toBeCloseTo(175.25 / windowWallLength);
});
