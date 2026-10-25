import { expect, test } from '@playwright/test';
import { createFloorPlanAIProvider } from '../fixtures/floorplan-ai-provider';
import { listenTestProvider } from '../fixtures/ai-provider';

test('overlapping source walls stop before furniture or native import', async ({ page }) => {
  const corners = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const walls = corners.map((start, i) => ({ id: `wall-${i}`, start, end: corners[(i + 1) % 4] }));
  const duplicated = { name: 'Synthetic repeated observation', floors: [{ walls: [...walls, { ...walls[0], id: 'repeat' }] }] };
  let calls = 0;
  const provider = createFloorPlanAIProvider(() => calls++, duplicated);
  const providerURL = await listenTestProvider(provider);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /Generate from floor-plan image/ }).click();
    await page.getByRole('button', { name: 'Configure', exact: true }).click();
    await page.getByLabel('Provider base URL', { exact: true }).fill(`${providerURL}/v1`);
    await page.getByLabel('OpenAI model', { exact: true }).fill('synthetic-preflight');
    await page.getByRole('button', { name: 'Save OpenAI settings', exact: true }).click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'synthetic-overlap.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('button', { name: 'Generate reconstruction', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Duplicate normalized wall geometry');
    await expect(page.getByRole('button', { name: 'Generate reconstruction', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Open editable home', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Review reconstructed plan', exact: true })).toHaveCount(0);
    expect(calls).toBe(1);
  } finally {
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
  }
});
