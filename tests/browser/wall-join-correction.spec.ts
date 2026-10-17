import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const width of [1440, 390]) for (const kind of ['corner', 'curve'] as const) {
  test(`Review ${kind} gap can be dragged closed and stays closed at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-3d', 'first-export'])));
    const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
    plan.id = `qa-join-${kind}`; plan.name = `QA ${kind} gap`;
    const floor = plan.floors[0]; floor.rooms = [];
    // Synthetic faults: a 6 cm corner gap on a shallow diagonal, or an 8 cm
    // T-junction gap at the actual curve, well away from its endpoint chord.
    floor.walls[0].end = { x: 600, y: kind === 'corner' ? 40 : 0 };
    floor.walls[1].start = { ...floor.walls[0].end };
    const target = kind === 'corner' ? { x: 600, y: 40 } : { x: 300, y: 120 };
    if (kind === 'corner') floor.walls[0].end.x -= 6;
    else {
      floor.walls[0].curvePoint = { x: 300, y: 240 };
      floor.walls.push({ ...floor.walls[3], id: 'qa-divider', start: { x: 300, y: 400 }, end: { x: 300, y: 128 } });
    }
    const subject = kind === 'corner' ? floor.walls[0] : floor.walls[4];
    plan.reconstruction = { version: 1, scale: { mode: 'provided', confidence: 1 }, assumptions: [], floors: [{
      floorId: floor.id, walls: [], doors: [], windows: [],
    }] };
    await page.goto('/editor');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'gap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
    await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();

    async function exported() {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
      return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
    }
    const baseline = await exported();
    const dialog = page.getByRole('dialog', { name: 'Review reconstruction', exact: true });
    async function openReview() {
      if (width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('button', { name: 'Review reconstruction', exact: true }).click();
      await expect(dialog).toBeVisible();
    }
    const closeReview = () => dialog.getByRole('button', { name: 'Close reconstruction review', exact: true }).click();
    const finding = () => dialog.getByRole('button', { name: new RegExp(`${subject.id} end stops`) });
    await openReview(); await finding().click();
    await dialog.getByRole('button', { name: 'Edit finding in plan', exact: true }).click();
    await expect(page.locator('[data-quick-geometry-toolbar]')).toBeVisible();
    const a = (await page.locator('[data-wall-endpoint-label="A"]').boundingBox())!;
    const b = (await page.locator('[data-wall-endpoint-label="B"]').boundingBox())!;
    const start = { x: a.x + a.width / 2, y: a.y + a.height * 1.5 };
    const end = { x: b.x + b.width / 2, y: b.y + b.height * 1.5 };
    const zoom = Math.hypot(end.x - start.x, end.y - start.y) /
      Math.hypot(subject.end.x - subject.start.x, subject.end.y - subject.start.y);
    await page.mouse.move(end.x, end.y); await page.mouse.down();
    // Cross the click/drag threshold even when the gap occupies < 3 phone pixels.
    await page.mouse.move(end.x - 20, end.y + 20, { steps: 3 });
    await page.mouse.move(end.x + (target.x - subject.end.x) * zoom, end.y + (target.y - subject.end.y) * zoom, { steps: 4 });
    await page.mouse.up();
    const corrected = await exported();
    const changed = corrected.floors[0].walls.find((wall: any) => wall.id === subject.id);
    expect(changed.end.x).toBeCloseTo(target.x, 5); expect(changed.end.y).toBeCloseTo(target.y, 5);
    expect(changed.start).toEqual(subject.start);
    expect(corrected.floors[0].walls.filter((wall: any) => wall.id !== subject.id))
      .toEqual(baseline.floors[0].walls.filter((wall: any) => wall.id !== subject.id));
    for (const key of ['doors', 'windows', 'rooms']) expect(corrected.floors[0][key]).toEqual(baseline.floors[0][key]);
    const roomCount = kind === 'corner' ? '1 room' : '2 rooms';
    await expect(page.getByRole('application')).toContainText(roomCount);
    await openReview(); await expect(finding()).toHaveCount(0); await closeReview();

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await exported()).floors[0].walls).toEqual(baseline.floors[0].walls);
    await expect(page.getByRole('application')).not.toContainText(roomCount);
    await openReview(); await expect(finding()).toBeVisible(); await closeReview();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await exported()).floors[0].walls).toEqual(corrected.floors[0].walls);
    await expect(page.getByRole('application')).toContainText(roomCount);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
    await page.reload();
    await expect(page.getByRole('application')).toContainText(roomCount);
    await openReview(); await expect(finding()).toHaveCount(0); await closeReview();
    expect((await exported()).floors[0].walls).toEqual(corrected.floors[0].walls);
    expect(errors).toEqual([]);
  });
}
