import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

for (const viewport of [{ width: 390, height: 900 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
  test(`3D inspection keeps the fitted home clear of its properties at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto('/editor');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles(resolve('tests/fixtures/top-down-framing.openplan.json'));
    async function exportedFloors() {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
      return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).floors;
    }
    const original = await exportedFloors();
    await page.getByRole('button', { name: 'Save', exact: true }).press('l');
    await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
    const properties = page.locator('[data-plan-properties]');
    const length = properties.getByRole('textbox', { name: 'Length (cm)', exact: true });
    const originalLength = await length.inputValue();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });
    await expect(length).toHaveValue(originalLength);
    const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').last();
    await expect(canvas).toHaveAttribute('data-rendered', 'true');
    async function expectUncoveredViewport() {
      await expect.poll(async () => {
        const a = (await canvas.boundingBox())!, b = (await properties.boundingBox())!;
        return a.width > 0 && a.height > 0 && !(a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1
          && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1);
      }).toBe(true);
    }
    await expectUncoveredViewport();
    await page.getByRole('button', { name: 'Top-Down View', exact: true }).click();
    await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => {
      const probe = document.createElement('canvas'); probe.width = node.width; probe.height = node.height;
      const context = probe.getContext('2d')!; context.drawImage(node, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, probe.width, probe.height);
      const bounds = node.getBoundingClientRect(), counts = [0, 0, 0, 0];
      let occluded = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 140 && b > 110 && r > g * 1.6 && b > g * 1.6) {
          counts[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)]++;
          const screenX = bounds.x + (x + 0.5) / width * bounds.width;
          const screenY = bounds.y + (y + 0.5) / height * bounds.height;
          if (document.elementFromPoint(screenX, screenY) !== node) occluded++;
        }
      }
      return counts.every(count => count > 25) && occluded === 0;
    })).toBe(true);
    await page.getByRole('button', { name: /1\.20 m/ }).click();
    await expect(canvas).toHaveAttribute('data-architectural-cut', '120');
    await expectUncoveredViewport();
    const picture = testInfo.outputPath('usable-3d-viewport.png');
    await page.screenshot({ path: picture });
    await testInfo.attach('usable-3d-viewport', { path: picture, contentType: 'image/png' });
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true }).click();
    await expect(page.getByText('Walkthrough Controls', { exact: true })).toBeVisible();
    await expectUncoveredViewport();
    await page.getByRole('button', { name: 'Exit Walkthrough Mode', exact: true }).click();
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await expect(page.locator('[data-quick-wall-length]')).toHaveValue(originalLength);
    expect(await exportedFloors()).toEqual(original);
  });
}
