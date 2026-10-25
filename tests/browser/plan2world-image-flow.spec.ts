import { listenTestProvider } from '../fixtures/ai-provider';
import { expect, test } from '@playwright/test';
import { createFloorPlanAIProvider, type FloorPlanProviderRequest } from '../fixtures/floorplan-ai-provider';

let providerURL: string;
let requests: FloorPlanProviderRequest[] = [];
const provider = createFloorPlanAIProvider(request => requests.push(request));

test.describe.configure({ timeout: 180_000 });
test.beforeAll(async () => { providerURL = await listenTestProvider(provider); });
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
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, 800, 600);
    context.strokeRect(0, 0, 799, 599); return canvas.toDataURL().split(',')[1];
  });
  await input.setInputFiles({ name: 'synthetic-floorplan.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByRole('img', { name: 'Selected floor plan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate reconstruction', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Review reconstructed plan', exact: true })).toBeVisible();
  await expect(page.getByText('Reconstruction ready for review.', { exact: true })).toBeVisible();
  await expect(page.getByText('Mock provider test dimensions', { exact: false })).toBeVisible();
  await expect(page.getByText('Browser smoke-test response.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Source boundary review', exact: true })).toContainText('1 of 1 observed zones');
  await expect(page.getByText('walls', { exact: true }).locator('..')).toContainText('4');
  await expect(page.getByText('doors', { exact: true }).locator('..')).toContainText('1');
  await expect(page.getByText('windows', { exact: true }).locator('..')).toContainText('1');

  // The extracted shared preview must still deliver calibration clicks to the import flow.
  const measurement = page.getByRole('button', { name: 'Pick two endpoints on the source image for scale calibration', exact: true });
  const bounds = (await measurement.boundingBox())!;
  await measurement.click({ position: { x: bounds.width * 0.2, y: bounds.height * 0.5 } });
  await measurement.click({ position: { x: bounds.width * 0.8, y: bounds.height * 0.5 } });
  await page.getByRole('spinbutton', { name: 'Actual length (cm)', exact: true }).fill('480');
  await page.getByRole('button', { name: 'Apply measured length', exact: true }).click();
  await expect(page.getByText('100% confidence', { exact: true })).toBeVisible();
  await expect(page.getByText(/User calibration:/).first()).toContainText('480 cm actual');

  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.path).toBe('/v1/responses');
    expect(request.method).toBe('POST');
    expect(request.body).toMatchObject({ model: 'floorplan-draft', store: false, text: { format: { type: 'json_object' } } });
    const content = request.body.input?.[0]?.content;
    expect(content?.some((item: any) => item.type === 'input_image' && /^data:image\/png;base64,/.test(item.image_url))).toBe(true);
  }
  const tracePrompt = requests[0].body.input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text;
  const annotationPrompt = requests[1].body.input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text;
  expect(tracePrompt).toContain('source-architecture-v1');
  expect(tracePrompt).toContain('functionalZones');
  expect(annotationPrompt).toContain('source-furnishing-v1');
  expect(annotationPrompt).toContain('FROZEN_ARCHITECTURE_JSON:');
  expect(JSON.parse(annotationPrompt.split('FROZEN_ARCHITECTURE_JSON:\n')[1]).functionalZones).toHaveLength(1);
  expect(annotationPrompt).not.toContain('Return ONLY one plan2world-draft-v1');

  await page.getByRole('button', { name: 'Open editable home', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?id=/);
  const app = page.getByRole('application');
  await expect(app).toContainText('4 walls');
  await expect(app).toContainText('1 door');
  await expect(app).toContainText('1 window');

  // The generated project retains evidence without another provider request.
  await page.reload();
  await page.getByRole('button', { name: 'Review reconstruction', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review reconstruction', exact: true });
  await expect(review).toContainText('Mock provider test dimensions');
  await expect(review).toContainText('480 cm actual');
  await expect(review).toContainText('100% confidence');
  await expect(review).toContainText('Browser smoke-test response.');
  await expect(review.getByRole('region', { name: 'Source boundary review', exact: true })).toContainText('1 of 1 observed zones');
  await expect(review.getByRole('img', { name: 'Source floor plan', exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  await review.getByRole('button', { name: 'Close reconstruction review', exact: true }).click();

  await page.getByRole('button', { name: '3D', exact: true }).click();
  const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendered', 'true');
  expect(errors).toEqual([]);
});
