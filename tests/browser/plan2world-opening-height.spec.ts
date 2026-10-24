import { test, expect } from '@playwright/test';
import { observeReviewCamera, reviewPoint } from './review-camera';
import { doorPanelPose } from '../../src/lib/utils/wallProfiles';
import { savedProjects } from './storage';

// Declared synthetic source geometry. No generated real-plan artifact is a fixture.
function draft(kind: 'door' | 'window') {
  return { schemaVersion: 'plan2world-draft-v1', name: 'Full-height initial openings', units: 'cm', scale: { mode: 'provided', confidence: 1 },
    floors: [{ id: 'floor-0', name: 'Ground Floor', level: 0,
      walls: [
        { id: 'north', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
        { id: 'east', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
        { id: 'south', start: { x: 400, y: 300 }, end: { x: 0, y: 300 } },
        { id: 'west', start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
      ],
      doors: [{ id: 'door', wallId: kind === 'door' ? 'north' : 'south', position: .5, width: 100 }],
      windows: [{ id: 'window', wallId: kind === 'window' ? 'north' : 'south', position: .5, width: 150 }], furniture: [],
    }] };
}
for (const width of [1440, 390]) for (const kind of ['door', 'window'] as const) {
  test(`initial full-height ${kind} can be selected and resized in 3D review at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await observeReviewCamera(page);
    await page.addInitScript(() => {
      localStorage.setItem('o3d_locale', 'en');
      localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-3d', 'first-export', 'first-door']));
    });
    await page.goto('/editor');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'declared-opening-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft(kind))) });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    let initial: any;
    await expect.poll(async () => {
      initial = Object.values(await savedProjects(page)).find((p: any) => p.name === 'Full-height initial openings'); return !!initial;
    }).toBe(true);
    expect(initial.floors[0].doors[0].height).toBe(280);
    expect(initial.floors[0].windows[0]).toMatchObject({ height: 280, sillHeight: 0 });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').first();
    await expect(canvas).toHaveAttribute('data-rendered', 'true');
    await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });
    await page.getByRole('button', { name:'Top-Down View', exact:true }).click();
    await page.getByRole('button', { name:'Edit Mode', exact:true }).click();
    await page.waitForTimeout(350);
    const floor = initial.floors[0];
    let target = {x:200,y:140,z:0};
    if (kind === 'door') {
      const pose = doorPanelPose(floor.walls.find((w: any)=>w.id==='north'),floor.doors[0]);
      target = {x:pose.x+49*Math.cos(pose.yaw),y:138,z:pose.z+49*Math.sin(pose.yaw)};
    }
    await page.mouse.click(...Object.values(await reviewPoint(page,target)) as [number,number]);
    const panel = page.locator('[data-plan-properties]');
    await expect(panel).toBeVisible();
    const height = panel.getByRole('spinbutton', { name: 'Height (cm)', exact: true });
    await expect(height).toHaveValue('280');
    await expect(page.getByRole('button', { name: 'Exit Edit Mode', exact: true })).toBeVisible();
    await height.fill(kind === 'door' ? '205' : '150'); await height.blur();
    if (kind === 'window') {
      const sill = panel.getByRole('spinbutton', { name: 'Sill Height (cm)', exact: true });
      await sill.fill('70'); await sill.blur();
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await savedProjects(page))[initial.id].floors[0][kind === 'door' ? 'doors' : 'windows'][0].height).toBe(kind === 'door' ? 205 : 150);
    const saved = (await savedProjects(page))[initial.id];
    expect(saved.floors[0].walls).toEqual(initial.floors[0].walls);
    expect(saved.floors[0][kind === 'door' ? 'doors' : 'windows'][0]).toMatchObject({ id: kind, wallId: 'north', position: .5, width: kind === 'door' ? 100 : 150 });
    if (kind === 'window') expect(saved.floors[0].windows[0].sillHeight).toBe(70);
    await expect(page.getByRole('button', { name: 'Exit Edit Mode', exact: true })).toBeVisible();
    await testInfo.attach('review-opening-height', { body: await page.screenshot(), contentType: 'image/png' });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    const reloaded = (await savedProjects(page))[initial.id];
    expect(reloaded.floors[0]).toEqual(saved.floors[0]);
    expect(errors).toEqual([]);
  });
}
