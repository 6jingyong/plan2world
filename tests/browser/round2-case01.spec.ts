import { expect, test } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { readFile, mkdir } from 'node:fs/promises';

const fixturePath = 'tests/fixtures/real-floorplans/round2/01-decorated-yj215/draft.json.gz.b64';

async function frozenDraftBuffer() {
  const encoded = (await readFile(fixturePath, 'utf8')).trim();
  return gunzipSync(Buffer.from(encoded, 'base64'));
}

async function importFrozenDraft(page: import('@playwright/test').Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({
    name: 'round2-case01-candidate-b.json',
    mimeType: 'application/json',
    buffer: await frozenDraftBuffer(),
  });
  await page.waitForLoadState('networkidle');
}

test('round2 case01 candidate B reaches live 3D and the 1.20 m cut', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await importFrozenDraft(page);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/round2-case01-${testInfo.project.name}-2d.png`, fullPage: true });

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeHidden({ timeout: 15_000 });
  const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
  const canvas = viewer.locator('canvas[data-plan3d-canvas="true"]').last();
  await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 15_000 });

  const topDown = page.getByRole('button', { name: 'Top-Down View', exact: true });
  await topDown.click();
  await page.screenshot({ path: `test-results/round2-case01-${testInfo.project.name}-3d-top.png`, fullPage: true });

  const cut = page.getByRole('button', { name: /1\.20 m/ });
  await expect(cut).toHaveAttribute('aria-pressed', 'false');
  await cut.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-architectural-cut', '120');
  await page.screenshot({ path: `test-results/round2-case01-${testInfo.project.name}-cut120.png`, fullPage: true });
});
