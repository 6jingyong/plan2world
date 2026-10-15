import { expect, test } from '@playwright/test';
import { createFloorPlanAIProvider, type FloorPlanProviderRequest } from '../fixtures/floorplan-ai-provider';

const providerURL = 'http://127.0.0.1:4201';
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
  'base64',
);
let requests: FloorPlanProviderRequest[] = [];
const provider = createFloorPlanAIProvider(request => requests.push(request));

test.describe.configure({ timeout: 180_000 });
test.beforeAll(async () => { await new Promise<void>(resolve => provider.listen(4201, '127.0.0.1', resolve)); });
test.afterAll(async () => { provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); });
test.beforeEach(() => { requests = []; });

test('image upload reaches the provider, pauses for review, then opens the editable 3D home', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  // The welcome screen is the public image-import entry point. Existing browser
  // coverage opens it from `/`; `/editor` intentionally skips this chooser.
  await page.goto('/');
  await page.getByRole('button', { name: /Generate from floor-plan image/ }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await page.getByLabel('Provider base URL', { exact: true }).fill(`${providerURL}/v1`);
  await page.getByLabel('OpenAI model', { exact: true }).fill('floorplan-draft');
  await page.getByRole('button', { name: 'Save OpenAI settings', exact: true }).click();
  await expect(page.getByText('OpenAI settings saved.', { exact: true })).toBeVisible();

  const input = page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]');
  await input.setInputFiles({ name: 'tiny-floorplan.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(page.getByRole('img', { name: 'Selected floor plan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate reconstruction', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Review reconstructed plan', exact: true })).toBeVisible();
  await expect(page.getByText('Reconstruction ready for review.', { exact: true })).toBeVisible();
  await expect(page.getByText('Mock provider test dimensions', { exact: false })).toBeVisible();
  await expect(page.getByText('Browser smoke-test response.', { exact: true })).toBeVisible();
  await expect(page.getByText('walls', { exact: true }).locator('..')).toContainText('4');
  await expect(page.getByText('doors', { exact: true }).locator('..')).toContainText('1');
  await expect(page.getByText('windows', { exact: true }).locator('..')).toContainText('1');

  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(request.path).toBe('/v1/responses');
  expect(request.method).toBe('POST');
  expect(request.body).toMatchObject({ model: 'floorplan-draft', store: false, text: { format: { type: 'json_object' } } });
  const content = request.body.input?.[0]?.content;
  expect(content?.some((item: any) => item.type === 'input_image' && /^data:image\/png;base64,/.test(item.image_url))).toBe(true);
  expect(content?.some((item: any) => item.type === 'input_text' && /plan2world-draft-v1/.test(item.text))).toBe(true);

  await page.getByRole('button', { name: 'Open editable home', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?id=/);
  const app = page.getByRole('application');
  await expect(app).toContainText('4 walls');
  await expect(app).toContainText('1 door');
  await expect(app).toContainText('1 window');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendered', 'true');
  expect(errors).toEqual([]);
});
