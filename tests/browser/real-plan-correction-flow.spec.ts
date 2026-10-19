import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile as readAsync } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Matrix4, Vector3 } from 'three';
import { createFloorPlanAIProvider, type FloorPlanProviderRequest } from '../fixtures/floorplan-ai-provider';

const reference = JSON.parse(readFileSync('tests/fixtures/real-floorplans/wikimedia-two-bedroom.json', 'utf8'));
const replay = structuredClone(reference);
// Keep source evidence unchanged; only declare the current semantic contract.
replay.presentation = 'semantic-white-model';
replay.furnitureVocabulary = 'plan2world-furniture-v1';
replay.name = 'Wikimedia real-plan correction replay';
const sourceHash = '14e965e54b8d2e9788c967eb4eed8b6dde46866717167f3698c51941aa51a5e1';
let requests: FloorPlanProviderRequest[] = [];
const provider = createFloorPlanAIProvider(request => requests.push(request), replay);

test.beforeAll(async () => { await new Promise<void>(resolve => provider.listen(4202, '127.0.0.1', resolve)); });
test.afterAll(async () => { provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); });
test.beforeEach(() => { requests = []; });

for (const width of [1440, 390]) test(`existing real source reaches a corrected, saved and walkable home at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-3d', 'first-export', 'first-door']));
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied for keyboard fallback regression', 'NotAllowedError'));
    const getContext = HTMLCanvasElement.prototype.getContext, seen = new WeakSet();
    const audit = { view: [] as number[], writes: 0 }; (window as any).__realPlanCamera = audit;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: any[]) {
      const gl = (getContext as any).apply(this, args);
      if (!gl || !String(args[0]).startsWith('webgl') || seen.has(gl)) return gl;
      seen.add(gl);
      const uniforms = new Map(), locate = gl.getUniformLocation.bind(gl), matrix = gl.uniformMatrix4fv.bind(gl);
      gl.getUniformLocation = (program: WebGLProgram, name: string) => {
        const location = locate(program, name); if (location) uniforms.set(location, name); return location;
      };
      gl.uniformMatrix4fv = (location: WebGLUniformLocation, transpose: boolean, values: Float32Array, ...rest: any[]) => {
        if (uniforms.get(location) === 'viewMatrix') { audit.view = Array.from(values); audit.writes++; }
        return matrix(location, transpose, values, ...rest);
      };
      return gl;
    } as typeof getContext;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Generate from floor-plan image/ }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await page.getByLabel('Provider base URL', { exact: true }).fill('http://127.0.0.1:4202/v1');
  await page.getByLabel('OpenAI model', { exact: true }).fill('existing-draft-replay');
  await page.getByRole('button', { name: 'Save OpenAI settings', exact: true }).click();
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles(resolve('tests/fixtures/real-floorplans/wikimedia-two-bedroom-source.jpg'));
  await expect(page.getByRole('img', { name: 'Selected floor plan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate reconstruction', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review reconstructed plan', exact: true })).toBeVisible();
  await expect(page.getByText('walls', { exact: true })).toBeVisible();
  await expect(page.getByText('doors', { exact: true }).locator('..')).toContainText('10');
  await expect(page.getByText('windows', { exact: true }).locator('..')).toContainText('7');
  const initialTrace = await page.locator('svg[aria-label="AI reconstruction trace"] path').first().getAttribute('d');
  await page.getByRole('button', { name: 'Open editable home', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?id=/);
  await expect(page).not.toHaveURL(/focus=/);

  // Pick a real reconstructed door through the normal editor UI. Correction belongs
  // here, not in the AI/provider fixture as a fabricated source-derived width.
  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  const doorsGroup = page.getByRole('button', { name: /Doors/ }).locator('..');
  await doorsGroup.locator('button').nth(1).click();
  const doorWidth = page.locator('[data-quick-opening-width]');
  const originalDoorWidth = Number(await doorWidth.inputValue());
  const editedDoorWidth = originalDoorWidth >= 80 ? originalDoorWidth - 10 : originalDoorWidth + 10;

  async function exported() {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    return JSON.parse(await readAsync((await (await pending).path())!, 'utf8'));
  }
  async function snapshot(name: string) {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }

  const imported = await exported();
  await doorWidth.fill(String(editedDoorWidth)); await doorWidth.press('Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(doorWidth).toHaveValue(String(originalDoorWidth));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(doorWidth).toHaveValue(String(editedDoorWidth));
  await expect(page.getByRole('application')).toContainText('11 rooms');

  const corrected = await exported(), floor = corrected.floors[0];
  expect(floor.walls).toEqual(imported.floors[0].walls);
  expect(floor.doors.slice(1)).toEqual(imported.floors[0].doors.slice(1));
  expect(floor.windows).toEqual(imported.floors[0].windows);
  expect(floor.doors[0].width).toBe(editedDoorWidth);
  expect(floor.doors[0].position).toBe(imported.floors[0].doors[0].position);
  expect(corrected.reconstruction).toEqual(imported.reconstruction);
  expect(floor.backgroundImage).toEqual(imported.floors[0].backgroundImage);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toHaveAttribute('title', /^Last saved:/);
  await page.reload();
  await expect(page.getByRole('application')).toContainText('11 rooms');
  if (width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('button', { name: 'Review reconstruction', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review reconstruction', exact: true });
  await expect(review.getByRole('img', { name: 'Source floor plan', exact: true })).toBeVisible();
  await expect(review.getByText('Geometry check', { exact: true })).toHaveCount(0);
  // Editing an opening must not mutate the accepted wall graph.
  expect(await review.locator('svg[aria-label="Current geometry trace"] path').first().getAttribute('d')).toBe(initialTrace);
  await snapshot('real-plan-corrected-review');
  await review.getByRole('button', { name: 'Close reconstruction review', exact: true }).click();
  expect((await exported()).floors[0].walls).toEqual(floor.walls);

  await page.getByRole('button', { name: '3D', exact: true }).click();
  const canvas = page.locator('canvas[data-plan3d-canvas="true"]');
  await expect(canvas).toHaveAttribute('data-rendered', 'true');
  const writes = await page.evaluate(() => (window as any).__realPlanCamera.writes);
  await page.getByRole('button', { name: /1\.20 m/ }).click();
  await expect(canvas).toHaveAttribute('data-architectural-cut', '120');
  await expect.poll(() => page.evaluate(() => (window as any).__realPlanCamera.writes)).toBeGreaterThan(writes);
  await snapshot('real-plan-architectural-cut');
  await page.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true }).click();
  await expect(page.getByText('Walkthrough Controls', { exact: true })).toBeVisible();
  await expect(canvas).not.toHaveAttribute('data-architectural-cut', /.+/);
  async function cameraPosition() {
    const view = await page.evaluate(() => (window as any).__realPlanCamera.view);
    return new Vector3().setFromMatrixPosition(new Matrix4().fromArray(view).invert());
  }
  await expect.poll(async () => (await cameraPosition()).y).toBeCloseTo(160);
  const start = await cameraPosition();
  expect(start.x).toBeGreaterThan(0); expect(start.x).toBeLessThan(690);
  expect(start.z).toBeGreaterThan(0); expect(start.z).toBeLessThan(1200);
  await page.keyboard.down('w');
  try { await expect.poll(async () => (await cameraPosition()).distanceTo(start)).toBeGreaterThan(5); }
  finally { await page.keyboard.up('w'); }
  await snapshot('real-plan-walkthrough');
  await page.getByRole('button', { name: 'Exit Walkthrough Mode', exact: true }).click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByRole('application')).toContainText('11 rooms');
  expect((await exported()).floors[0].doors[0].width).toBe(editedDoorWidth);

  expect(requests).toHaveLength(2);
  for (const request of requests) {
    const image = request.body.input?.[0]?.content?.find((item: any) => item.type === 'input_image');
    expect(createHash('sha256').update(Buffer.from(image.image_url.split(',')[1], 'base64')).digest('hex')).toBe(sourceHash);
  }
  const tracePrompt = requests[0].body.input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text;
  const annotationPrompt = requests[1].body.input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text;
  expect(tracePrompt).toContain('source-wall-trace-v1');
  expect(annotationPrompt).toContain('source-annotation-v1');
  expect(annotationPrompt).toContain('BARE_HOUSE_JSON:');
  expect(annotationPrompt).not.toContain('return the final draft');
  expect(errors).toEqual([]);
});
