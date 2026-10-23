import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

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

test('1.20 m architectural cut clips the live 3D canvas and yields to the floor-stack review', async ({ page }) => {
  await open3D(page);

  const cut = page.getByRole('button', { name: /1\.20 m/ });
  const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').last();

  await expect(cut).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).not.toHaveAttribute('data-architectural-cut', /.+/);

  await cut.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-architectural-cut', '120');

  await page.getByRole('button', { name: 'Show All Floors Stacked', exact: true }).click();
  await expect(cut).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).not.toHaveAttribute('data-architectural-cut', /.+/);
});

test('architectural cut keeps low geometry and removes the upper side', async ({ page }) => {
  const plan = JSON.parse(await readFile('tests/fixtures/top-down-framing.openplan.json', 'utf8'));
  plan.floors = [plan.floors[0]];
  const floor = plan.floors[0];
  floor.columns = [{ id: 'low-marker', position: { x: 900, y: 1100 }, rotation: 0,
    diameter: 200, height: 30, shape: 'square', color: '#00ff00' }];
  // A full-width opening leaves the magenta lintel entirely above 200 cm.
  // Unlike a tall column, it has no lower side faces that should remain.
  floor.walls.push({ id: 'upper-marker', start: { x: 600, y: 500 }, end: { x: 1200, y: 500 },
    thickness: 100, height: 280, color: '#ff00ff' });
  floor.doors.push({ id: 'marker-opening', wallId: 'upper-marker', position: 0.5, width: 600,
    height: 200, type: 'opening', swingDirection: 'left' });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'cut-sides.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });
  const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').last();
  const markerPixels = () => canvas.evaluate((node: HTMLCanvasElement) => {
    const probe = document.createElement('canvas'); probe.width = node.width; probe.height = node.height;
    const context = probe.getContext('2d')!; context.drawImage(node, 0, 0);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    let low = 0, high = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 100 && g > r * 1.6 && g > b * 1.6) low++;
      if (r > 140 && b > 110 && r > g * 1.6 && b > g * 1.6) high++;
    }
    return { low, high };
  });
  await page.getByRole('button', { name: 'Top-Down View', exact: true }).click();
  await expect.poll(async () => {
    const { low, high } = await markerPixels(); return low > 100 && high > 100;
  }).toBe(true);
  await page.getByRole('button', { name: /1\.20 m/ }).click();
  // These are actual framebuffer pixels. A dataset flag alone cannot prove
  // which side of the plane Three.js discarded.
  await expect.poll(async () => {
    const { low, high } = await markerPixels(); return low > 100 && high === 0;
  }).toBe(true);
});
