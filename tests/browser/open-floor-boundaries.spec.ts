import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const width of [1440, 390]) test(`open balcony ground edits survive views, history and saving at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(resolve('examples/plan2world-open-balcony.example.json'));
  await expect(page.getByRole('button', { name: 'Open balcony example', exact: true })).toBeVisible();
  async function exported() {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  }
  const initial = await exported(), initialFloor = initial.floors[0];
  expect(initialFloor.walls).toHaveLength(4);
  expect(initialFloor.rooms.find((room: any) => room.id === 'balcony')).toMatchObject({ area: 12, roomType: 'outdoor', walls: [] });
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: 'Select room Balcony', exact: true }).click();
  const properties = page.locator('[data-plan-properties]');
  await expect(properties.locator('[data-floor-boundary]')).toBeVisible();
  const outerY = properties.locator('[data-boundary-coordinate="1-point-y"]');
  await outerY.fill('700'); await outerY.press('Tab');
  await expect(properties.getByText('15.0 m²', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(outerY).toHaveValue('600');
  await expect(properties.getByText('12.0 m²', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(outerY).toHaveValue('700');
  const otherY = properties.locator('[data-boundary-coordinate="2-point-y"]');
  await otherY.fill('700'); await otherY.press('Tab');
  await expect(properties.getByText('18.0 m²', { exact: true })).toBeVisible();
  await properties.getByRole('checkbox', { name: 'Curve to next part', exact: true }).first().check();
  const control = properties.locator('[data-boundary-coordinate="1-curvePoint-y"]');
  await control.fill('800'); await control.press('Tab');
  await expect(properties.getByText('20.0 m²', { exact: true })).toBeVisible();
  // The floor's own material identifies actual rendered ground in both canvases.
  await properties.getByRole('button', { name: 'Solid Color', exact: true }).click();
  await properties.getByLabel('Custom color', { exact: true }).fill('#ff00ff');
  const edited = await exported();
  expect(edited.floors[0].walls).toEqual(initialFloor.walls);
  expect(edited.floors[0].doors).toEqual(initialFloor.doors);
  expect(edited.floors[0].windows).toEqual(initialFloor.windows);
  expect(edited.floors[0].furniture).toEqual(initialFloor.furniture);
  expect(edited.floors[0].rooms.find((room: any) => room.id === 'balcony').boundary).toEqual([
    { wallId: 'w3' }, { point: { x: 0, y: 700 }, curvePoint: { x: 300, y: 800 } }, { point: { x: 600, y: 700 } },
  ]);
  await page.getByRole('button', { name: 'Save', exact: true }).press('Escape');
  async function groundPixels(canvas: import('@playwright/test').Locator) {
    return canvas.evaluate((node: HTMLCanvasElement) => {
      const probe = document.createElement('canvas'); probe.width = node.width; probe.height = node.height;
      const ctx = probe.getContext('2d')!; ctx.drawImage(node, 0, 0);
      const { data } = ctx.getImageData(0, 0, node.width, node.height); let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 110 && data[i + 2] > 110 && data[i] > data[i + 1] * 1.5 && data[i + 2] > data[i + 1] * 1.5) count++;
      return count;
    });
  }
  const planCanvas = page.getByLabel('Floor plan editor canvas', { exact: true });
  await page.getByTitle('Zoom to Fit (F)', { exact: true }).first().click();
  await expect.poll(() => groundPixels(planCanvas)).toBeGreaterThan(100);
  await testInfo.attach('open-ground-2d', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
  const canvas = viewer.locator('canvas').last();
  await viewer.getByRole('button', { name: 'Top-Down View', exact: true }).click();
  await expect.poll(() => groundPixels(canvas)).toBeGreaterThan(100);
  await viewer.getByRole('button', { name: /1\.20 m/ }).click();
  await expect(canvas).toHaveAttribute('data-architectural-cut', '120');
  await expect.poll(() => groundPixels(canvas)).toBeGreaterThan(100);
  await testInfo.attach('open-ground-cut', { body: await page.screenshot(), contentType: 'image/png' });
  await viewer.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Exit Walkthrough Mode', exact: true })).toBeVisible();
  await expect(canvas).not.toHaveAttribute('data-architectural-cut', /.+/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
  await page.reload();
  const restored = await exported();
  expect(restored.floors).toEqual(edited.floors);
  // The existing Review URL handoff uses selectedRoomId and opens its controls.
  await page.goto(`/editor?id=${restored.id}&focusFloor=white-floor&focus=balcony&focus=w3`);
  await expect(page).not.toHaveURL(/focusFloor=/);
  await expect(control).toHaveValue('800');
  await expect(properties.getByText('20.0 m²', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
