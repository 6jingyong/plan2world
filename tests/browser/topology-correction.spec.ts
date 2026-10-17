import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function importProject(page: Page, plan: any) {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'topology.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
}
async function exported(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}
async function openReview(page: Page, width: number) {
  if (width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('button', { name: 'Review reconstruction', exact: true }).click();
  return page.getByRole('dialog', { name: 'Review reconstruction', exact: true });
}
async function saveAndReload(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
  await page.reload();
}

for (const width of [1440, 390]) {
  test(`all Review findings stay actionable while false partitions are removed at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-export'])));
    const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
    plan.id = 'qa-oversegmentation'; plan.name = 'QA topology correction';
    const floor = plan.floors[0]; floor.walls = []; floor.rooms = []; floor.doors = []; floor.windows = [];
    const wall = (id: string, x: number, y: number, endX: number, endY: number) => ({
      id, start: { x, y }, end: { x: endX, y: endY }, height: 280, thickness: 12, color: '#444444',
    });
    // Synthetic 5x5 false partition grid, plus six small annotation-like wall
    // fragments that place the topology findings beyond the first six entries.
    for (let i = 0; i <= 5; i++) {
      floor.walls.push(wall(`h${i}`, 0, i * 80, 400, i * 80), wall(`v${i}`, i * 80, 0, i * 80, 400));
    }
    for (let i = 0; i < 6; i++) floor.walls.push(wall(`fragment-${i}`, 600 + i * 40, 0, 610 + i * 40, 0));
    plan.reconstruction = { version: 1, scale: { mode: 'provided', confidence: 1 }, assumptions: [],
      floors: [{ floorId: floor.id, walls: [], doors: [], windows: [] }] };
    await importProject(page, plan);
    const baseline = await exported(page);
    await expect(page.getByRole('application')).toContainText('25 rooms');
    let review = await openReview(page, width);
    const topology = () => review.getByRole('button', { name: /25 enclosed regions were detected/ });
    await expect(topology()).toHaveCount(0);
    await expect(review.getByRole('button', { name: /^Show all \d+ findings$/ })).toBeVisible();
    await review.getByRole('button', { name: /^Show all \d+ findings$/ }).click();
    await topology().click();
    await review.getByRole('button', { name: 'Show fewer findings', exact: true }).click();
    await expect(review.getByRole('button', { name: /finding in plan$/ })).toHaveCount(0);
    await review.getByRole('button', { name: /^Show all \d+ findings$/ }).click();
    await topology().click();
    await review.getByRole('button', { name: 'Inspect finding in plan', exact: true }).click();
    await expect(page.locator('[data-quick-geometry-toolbar]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).press('Delete');
    expect((await exported(page)).floors[0].walls).toEqual(baseline.floors[0].walls);
    // An aggregate warning needs a source-based human choice of which partition
    // is false. Use the normal Layers selection and native Delete operation.
    await page.getByRole('button', { name: 'Save', exact: true }).press('l');
    const remaining = [...baseline.floors[0].walls];
    for (const id of ['h1', 'v1', 'h2', 'v2', 'h3', 'v3', 'h4', 'v4']) {
      const index = remaining.findIndex((wall: any) => wall.id === id);
      await page.getByRole('button', { name: `─ Wall ${index + 1}`, exact: true }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).press('Delete');
      remaining.splice(index, 1);
    }
    await expect(page.getByRole('application')).toContainText('1 room');
    expect((await exported(page)).floors[0].walls).toEqual(remaining);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('application')).toContainText('2 rooms');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByRole('application')).toContainText('1 room');
    await saveAndReload(page);
    await expect(page.getByRole('application')).toContainText('1 room');
    // The initial-image Review uses the same handoff through a one-shot URL.
    await page.goto(`/editor?id=${plan.id}&focusFloor=${floor.id}&focusMode=inspect&focus=h0&focus=v0`);
    await expect(page).not.toHaveURL(/focus(?:Floor|Mode)?=/);
    await expect(page.locator('[data-quick-geometry-toolbar]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).press('Delete');
    expect((await exported(page)).floors[0].walls).toEqual(remaining);
    review = await openReview(page, width);
    await review.getByRole('button', { name: /^Show all \d+ findings$/ }).click();
    await expect(review).not.toContainText('unusually');
    await expect(review).not.toContainText('m². Check the source');
    await review.getByRole('button', { name: 'Close reconstruction review', exact: true }).click();
    const restored = await exported(page);
    expect(restored.floors[0].walls).toEqual(remaining);
    expect(restored.reconstruction).toEqual(baseline.reconstruction);
  });

  test(`a missing boundary can be redrawn without replacing the floor at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-export']));
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas' && (text === 'Origin' || text === 'Scale')) {
          const p = new DOMPoint(x, y).matrixTransform(this.getTransform()), b = this.canvas.getBoundingClientRect();
          ((window as any).__topologyMap ??= {})[text] = { x: b.x + p.x * b.width / this.canvas.width, y: b.y + p.y * b.height / this.canvas.height };
        }
        return maxWidth === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, maxWidth);
      };
    });
    const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
    plan.id = 'qa-missing-wall'; plan.name = 'QA missing boundary';
    const floor = plan.floors[0]; floor.walls.shift(); floor.rooms = []; floor.doors = [];
    floor.walls[0].start = { x: 600, y: 40 };
    floor.textAnnotations = [0, 600].map((x, i) => ({ id: `map-${i}`, text: i ? 'Scale' : 'Origin', x, y: -100, fontSize: 10, rotation: 0, color: '#555555' }));
    await importProject(page, plan);
    const baseline = await exported(page);
    await expect(page.getByRole('application')).not.toContainText('1 room');
    await page.getByRole('button', { name: 'Save', exact: true }).press('w');
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__topologyMap?.Scale))).toBe(true);
    async function clickWorld(x: number, y: number) {
      const point = await page.evaluate(({ x, y }) => {
        const map = (window as any).__topologyMap, a = map.Origin, scale = (map.Scale.x - a.x) / 600;
        return { x: a.x + x * scale, y: a.y + (y + 100) * scale };
      }, { x, y });
      await page.mouse.click(point.x, point.y);
    }
    await clickWorld(0, 0); await clickWorld(600, 40);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('application')).toContainText('1 room');
    const corrected = await exported(page), walls = corrected.floors[0].walls;
    expect(walls).toHaveLength(4);
    expect(walls.slice(0, 3)).toEqual(baseline.floors[0].walls);
    expect(walls[3].start).toMatchObject({ x: 0, y: 0 }); expect(walls[3].end).toMatchObject({ x: 600, y: 40 });
    expect(corrected.floors[0].windows).toEqual(baseline.floors[0].windows);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('application')).not.toContainText('1 room');
    expect((await exported(page)).floors[0].walls).toEqual(baseline.floors[0].walls);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await saveAndReload(page);
    await expect(page.getByRole('application')).toContainText('1 room');
    expect((await exported(page)).floors[0].walls).toEqual(walls);
  });
}
