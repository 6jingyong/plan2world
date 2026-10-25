import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createFloorPlanAIProvider } from '../fixtures/floorplan-ai-provider';
import { listenTestProvider } from '../fixtures/ai-provider';

test('merged source zones reach review and survive native save/reload without another model call', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const decision = { decision: 'accept', evidence: 'Declared synthetic source outline.', decisionBasis: 'Synthetic handoff case.' };
  const functionalZones = [{ label: 'Bathroom C', left: 0, right: 200 }, { label: 'Study', left: 200, right: 400 }]
      .map(({ label, left, right }) => ({ ...decision, label, category: 'room', environment: 'indoor', position: { x: left + 100, y: 150 },
        boundary: [{ x: left, y: 0 }, { x: right, y: 0 }, { x: right, y: 300 }, { x: left, y: 300 }]
          .map(point => ({ point, kind: 'wall', evidence: 'Synthetic zone outline; shared physical partition is absent.' })) }));
  let calls = 0;
  const provider = createFloorPlanAIProvider(() => calls++, undefined, { functionalZones });
  const providerURL = await listenTestProvider(provider);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /Generate from floor-plan image/ }).click();
    await page.getByRole('button', { name: 'Configure', exact: true }).click();
    await page.getByLabel('Provider base URL', { exact: true }).fill(`${providerURL}/v1`);
    await page.getByLabel('OpenAI model', { exact: true }).fill('synthetic-source-review');
    await page.getByRole('button', { name: 'Save OpenAI settings', exact: true }).click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
      const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, 800, 600);
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'synthetic-source.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('button', { name: 'Generate reconstruction', exact: true }).click();
    const report = page.getByRole('region', { name: 'Source boundary review', exact: true });
    await expect(report).toContainText('0 of 2 observed zones');
    await expect(report).toContainText('Bathroom C: Shares a reconstructed region');
    await expect(report).toContainText('Study: Shares a reconstructed region');
    await page.getByRole('button', { name: 'Open editable home', exact: true }).click();
    await expect(page).toHaveURL(/\/editor\?id=/);
    await page.reload();
    await page.getByRole('button', { name: 'Review reconstruction', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review reconstruction', exact: true });
    await expect(dialog).toContainText('Source boundary review at import');
    await expect(dialog).toContainText('0 of 2 observed zones');
    await expect(dialog).toContainText('retained after edits');
    await dialog.screenshot({ path: test.info().outputPath('source-review.png') });
    await dialog.getByRole('button', { name: 'Close reconstruction review', exact: true }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    const project = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    expect(project.reconstruction.observationReview).toMatchObject({ acceptedZoneCount: 2, supportedZoneCount: 0,
      zoneFindings: [{ label: 'Bathroom C' }, { label: 'Study' }] });
    expect(project.floors[0].walls).toHaveLength(4);
    expect(calls).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
  }
});
