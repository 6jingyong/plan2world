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
  await page.getByRole('button', { name: /opening door 1/i }).click();
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

for (const viewportWidth of [1440, 390]) {
test(`Review focus keeps endpoint labels on the live wall at ${viewportWidth}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: viewportWidth, height: 900 });
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas' &&
          (text === 'Reference A' || text === 'Reference B')) {
        const point = new DOMPoint(x, y).matrixTransform(this.getTransform());
        const rect = this.canvas.getBoundingClientRect();
        ((window as any).__endpointReferences ??= {})[text] = {
          x: rect.x + point.x * rect.width / this.canvas.width,
          y: rect.y + point.y * rect.height / this.canvas.height,
        };
      }
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  // Synthetic fixed references let us verify the actual canvas transform independently of the badges.
  plan.floors[0].textAnnotations = [-200, 800].map((x, i) => ({
    id: `endpoint-reference-${i}`, x, y: -200, text: i ? 'Reference B' : 'Reference A',
    fontSize: 10, rotation: 0, color: '#555555',
  }));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'endpoint-labels.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page).toHaveURL(/id=qa-connected-dimensions/);
  await page.goto('/editor?id=qa-connected-dimensions&focusFloor=dimensions-floor&focus=qa-wall-0');

  const canvasArea = page.getByRole('application');
  const a = canvasArea.locator('[data-wall-endpoint-label="A"]');
  const b = canvasArea.locator('[data-wall-endpoint-label="B"]');
  await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();

  async function expectEndpoints(start: { x: number; y: number }, end: { x: number; y: number }) {
    await expect.poll(async () => {
      const references = await page.evaluate(() => (window as any).__endpointReferences);
      if (!references?.['Reference A'] || !references?.['Reference B']) return false;
      const origin = references['Reference A'], scale = (references['Reference B'].x - origin.x) / 1000;
      for (const [label, point] of [[a, start], [b, end]] as const) {
        const rect = await label.boundingBox();
        if (!rect) return false;
        const x = origin.x + (point.x + 200) * scale;
        const y = origin.y + (point.y + 200) * scale;
        // Labels sit beside their real endpoints and leave the drag handles unobstructed.
        if (Math.abs(rect.x + rect.width / 2 - x) > 1 || y - rect.y - rect.height < 5 || y - rect.y > 45) return false;
      }
      return true;
    }).toBe(true);
  }

  await expectEndpoints({ x: 0, y: 0 }, { x: 600.5, y: 0 });
  await page.locator('[data-quick-fixed-endpoint="end"]').click();
  const length = page.locator('[data-quick-wall-length]');
  await length.fill('650.5');
  await length.press('Enter');
  await expectEndpoints({ x: -50, y: 0 }, { x: 600.5, y: 0 });
  await expect(canvasArea).toContainText('1 room');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectEndpoints({ x: 0, y: 0 }, { x: 600.5, y: 0 });
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expectEndpoints({ x: -50, y: 0 }, { x: 600.5, y: 0 });
  await testInfo.attach('wall-endpoint-labels', { body: await page.screenshot(), contentType: 'image/png' });

  // Canvas-local labels follow camera movement rather than floating over the sidebars.
  const canvas = page.getByLabel('Floor plan editor canvas', { exact: true });
  const rect = (await canvas.boundingBox())!;
  // On compact layouts the zoom controls sit over the canvas centre, above
  // the properties sheet. Send pointer input to an uncovered part of the canvas.
  const interactionPoint = { x: rect.x + rect.width / 2, y: rect.y + 100 };
  const beforeZoom = await page.evaluate(() => (window as any).__endpointReferences['Reference A'].x);
  await canvas.hover({ position: { x: rect.width / 2, y: 100 } });
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(before =>
    Math.abs((window as any).__endpointReferences['Reference A'].x - before), beforeZoom)).toBeGreaterThan(1);
  await expectEndpoints({ x: -50, y: 0 }, { x: 600.5, y: 0 });

  const beforePan = await a.boundingBox();
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(interactionPoint.x + 35, interactionPoint.y + 25, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => Math.abs((await a.boundingBox())!.x - beforePan!.x)).toBeGreaterThan(20);
  await expectEndpoints({ x: -50, y: 0 }, { x: 600.5, y: 0 });

  // A door uses its host wall; a window on the next wall must move both badges.
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: /opening door 1/i }).click();
  await expectEndpoints({ x: -50, y: 0 }, { x: 600.5, y: 0 });
  await page.getByRole('button', { name: /standard window 1/i }).click();
  await expectEndpoints({ x: 600.5, y: 0 }, { x: 600, y: 400 });
  await page.getByRole('button', { name: 'Save', exact: true }).press('ControlOrMeta+a');
  await expect(page.locator('[data-quick-geometry-toolbar]')).toHaveCount(0);
  await expect(a).toHaveCount(0);
  await expect(b).toHaveCount(0);
  // Layers must clear the multi-selection and restore the same primary wall.
  await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
  await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();
  await expectEndpoints({ x: -50, y: 0 }, { x: 600.5, y: 0 });
  await page.getByRole('button', { name: 'Save', exact: true }).press('Escape');
  await expect(a).toHaveCount(0);
  await expect(b).toHaveCount(0);
});
}
