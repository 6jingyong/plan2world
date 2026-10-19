import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const width of [1440, 390]) test(`imported object can be selected and styled in the existing editor at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall','first-furniture','first-3d','first-export','first-door'])));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('examples/plan2world-imported-objects.example.json'));
  await expect(page.getByRole('button', { name: 'Imported object editing example', exact: true })).toBeVisible();
  async function exported() {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  }
  const imported = await exported();
  expect(imported.floors[0].windows[0]).toMatchObject({ height: 280, sillHeight: 0, type: 'fixed' });
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: /sofa$/i }).click();
  const styles = page.locator('[data-furniture-style]');
  await expect(styles).toHaveValue('imported_object');
  await page.getByLabel('Custom color', { exact: true }).fill('#ff00ff');
  await page.getByRole('button', { name: 'Save', exact: true }).press('Escape');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
  const canvas = viewer.locator('canvas').last(); await expect(canvas).toBeVisible({ timeout: 60_000 });
  await viewer.getByRole('button', { name: 'Edit Mode', exact: true }).click();
  await viewer.getByRole('button', { name: 'Top-Down View', exact: true }).click();
  async function blockPoint() {
    return canvas.evaluate((node: HTMLCanvasElement) => {
      const probe = document.createElement('canvas'); probe.width = node.width; probe.height = node.height;
      const ctx = probe.getContext('2d')!; ctx.drawImage(node, 0, 0);
      const { data } = ctx.getImageData(0, 0, node.width, node.height);
      let x = 0, y = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 110 && data[i + 2] > 110 && data[i] > data[i + 1] * 1.5 && data[i + 2] > data[i + 1] * 1.5) {
        const pixel = i / 4; x += pixel % node.width; y += Math.floor(pixel / node.width); count++;
      }
      return count > 100 ? { x: x / count * node.clientWidth / node.width, y: y / count * node.clientHeight / node.height } : null;
    });
  }
  await expect.poll(blockPoint).not.toBeNull();
  await canvas.click({ position: (await blockPoint())! });
  await expect(styles).toHaveValue('imported_object');
  const blockPixels = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await styles.selectOption('sofa');
  await expect(styles).toHaveValue('sofa');
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(blockPixels);
  await testInfo.attach('styled-in-3d', { body: await page.screenshot(), contentType: 'image/png' });
  const styled = await exported();
  expect(styled.floors[0].furniture[0]).toEqual({ ...imported.floors[0].furniture[0], catalogId: 'sofa', renderStyle: 'model', color: '#ff00ff' });
  expect(styled.floors[0].walls).toEqual(imported.floors[0].walls);
  expect(styled.floors[0].rooms).toEqual(imported.floors[0].rooms);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(styles).toHaveValue('imported_object');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(styles).toHaveValue('sofa');
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: /fixed window 1/i }).click();
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('sliding');
  await page.getByRole('button', { name: /single door 1/i }).click();
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('double');
  const withOpenings = await exported();
  expect(withOpenings.floors[0].windows[0]).toEqual({ ...styled.floors[0].windows[0], type: 'sliding' });
  expect(withOpenings.floors[0].doors[0]).toEqual({ ...styled.floors[0].doors[0], type: 'double' });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
  await page.reload(); await expect(page.locator('[data-furniture-style]')).toHaveCount(0);
  expect((await exported()).floors).toEqual(withOpenings.floors);
  expect(errors).toEqual([]);
});
