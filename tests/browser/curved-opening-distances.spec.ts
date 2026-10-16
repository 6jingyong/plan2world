import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Independent measurement of the viewer's 16-span path; no application helper
// is used to derive the expected values or exported Bezier parameters.
const points = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  return { x: 1000 * t * t, y: 2000 * (1 - t) * t };
});
const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
const total = lengths.reduce((sum, value) => sum + value, 0);
function distanceAt(t: number) {
  const scaled = t * 16, index = Math.min(15, Math.floor(scaled));
  return lengths.slice(0, index).reduce((sum, value) => sum + value, 0) + lengths[index] * (scaled - index);
}
const displayed = (value: number) => String(Math.round(value * 1000) / 1000);

for (const width of [1440, 390]) {
  test(`curved opening corrections use path distance at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall','first-furniture','first-3d','first-export','first-door']));
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas' && this.fillStyle === '#ffffff') {
          ((window as any).__pathDistanceLabels ??= []).push(text);
        }
        return maxWidth === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, maxWidth);
      };
    });
    const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
    const floor = plan.floors[0], wall = floor.walls[0];
    Object.assign(wall, { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, curvePoint: { x: 0, y: 1000 } });
    floor.walls = [wall]; floor.rooms = [];
    floor.doors[0].position = 0.5;
    floor.windows[0].wallId = wall.id; floor.windows[0].position = 0.75;
    await page.goto('/editor');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'curve-distance.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
    await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.press('l');
    await page.getByRole('button', { name: /opening door 1/i }).click();
    const quick = page.locator('[data-quick-opening-offset-a]');
    const fromA = page.getByRole('spinbutton', { name: 'Distance from A (cm)', exact: true });
    const fromB = page.getByRole('spinbutton', { name: 'Distance from B (cm)', exact: true });
    await expect(quick).toHaveValue(displayed(distanceAt(0.5)));
    await expect(fromA).toHaveValue(displayed(distanceAt(0.5)));
    await expect(fromB).toHaveValue(displayed(total - distanceAt(0.5)));
    for (const distance of [distanceAt(0.5), total - distanceAt(0.5)]) {
      await expect.poll(() => page.evaluate(() => (window as any).__pathDistanceLabels ?? [])).toContain(`${parseFloat((distance / 100).toFixed(2))} m`);
    }
    async function exported() {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
      return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).floors[0];
    }
    const original = await exported();
    // A focus/blur of the rounded distance must preserve its exact saved parameter.
    await quick.focus(); await quick.press('Tab');
    expect((await exported()).doors).toEqual(original.doors);

    await quick.fill(displayed(distanceAt(0.25))); await quick.press('Enter');
    const moved = await exported();
    expect(moved.doors[0].position).toBeCloseTo(0.25, 5);
    expect({ ...moved.doors[0], position: original.doors[0].position }).toEqual(original.doors[0]);
    await expect(fromA).toHaveValue(displayed(distanceAt(0.25)));
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await exported()).doors).toEqual(original.doors);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await exported()).doors).toEqual(moved.doors);

    await page.getByRole('button', { name: /standard window 1/i }).click();
    await expect(quick).toHaveValue(displayed(distanceAt(0.75)));
    await fromB.fill(displayed(total - distanceAt(0.5))); await fromB.press('Tab');
    const shifted = await exported();
    expect(shifted.windows[0].position).toBeCloseTo(0.5, 5);
    await expect(quick).toHaveValue(displayed(distanceAt(0.5)));
    expect(shifted.walls).toEqual(original.walls);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await exported()).windows).toEqual(original.windows);

    if (width === 1440) {
      await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
      await page.getByRole('button', { name: 'Elevation', exact: true }).first().click();
      const canvas = page.getByLabel('Wall elevation editor canvas', { exact: true });
      const box = (await canvas.boundingBox())!;
      const scale = Math.min((box.width - 136) / total, (box.height - 100) / 250);
      const floorY = box.y + 36 + (box.height - 100 + 250 * scale) / 2;
      const x = box.x + 72 + distanceAt(0.75) * scale;
      const y = floorY - (90 + floor.windows[0].height / 2) * scale;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 100 * scale, y, { steps: 5 }); await page.mouse.up();
      const dragged = await exported();
      // Pointer coordinates are rounded to physical pixels by each browser.
      expect(Math.abs(distanceAt(dragged.windows[0].position) - distanceAt(0.75) - 100)).toBeLessThanOrEqual(1 / scale + 0.1);
      expect(dragged.walls).toEqual(original.walls);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      expect((await exported()).windows).toEqual(original.windows);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: /opening door 1/i }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Dimensions', exact: true }).click();
      await page.getByRole('button', { name: 'ft, inch', exact: true }).click();
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await quick.focus(); await quick.press('Tab');
      expect((await exported()).doors).toEqual(moved.doors);
      await quick.fill('321'); await quick.press('Enter');
      const imperial = await exported();
      expect(distanceAt(imperial.doors[0].position)).toBeCloseTo(321 * 2.54, 8);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      expect((await exported()).doors).toEqual(moved.doors);
    }
  });
}
