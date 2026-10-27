import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';

describe('source-recovery local CLI/manual handoff', () => {
  it('preserves a refusal, exports a working choice page, binds the answer to the source and never overwrites a run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'p2w-source-recovery-'));
    try {
      const source = join(directory, 'source.png'), input = join(directory, 'source.json'), furnishing = join(directory, 'furnishing.json');
      const raster = { width: 100, height: 100, data: Buffer.alloc(100 * 100 * 4, 255) };
      await writeFile(source, await encodeRgbaPng(raster));
      const p = (x: number, y: number) => ({ x, y }), e = { decision: 'accept', evidence: 'Synthetic fixture.', decisionBasis: 'Synthetic fixture.' };
      const observation = { schemaVersion: 'source-architecture-v1', scaleEvidence: { kind: 'provided_length', realLengthCm: 100, endpoints: [p(0, 0), p(100, 0)], evidence: 'Synthetic scale.' },
        walls: [[100, 0, 100, 100], [100, 100, 0, 100], [0, 100, 0, 0]].map(([x, y, a, b], i) => ({ ...e, label: `edge ${i}`, start: p(x, y), end: p(a, b) })),
        openings: [{ ...e, label: 'Synthetic entry', kind: 'door', endpoints: [p(20, 0), p(60, 0)] }], doorGaps: [] };
      const wire = JSON.stringify(observation);
      await writeFile(input, wire); await writeFile(furnishing, JSON.stringify({ schemaVersion: 'source-furnishing-v1', furniture: [] }));
      const call = (output: string, extra: string[] = []) => {
        try {
          execFileSync(process.execPath, ['tooling/recover-plan2world-source.mjs', '--input', input, '--source', source, '--furnishing', furnishing, '--output', output, ...extra],
            { cwd: resolve('.'), env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' }); return 0;
        } catch (e: any) { return e.status; }
      };
      const pending = join(directory, 'pending'); expect(call(pending)).toBe(2);
      expect(await readFile(join(pending, 'observation-original.json'), 'utf8')).toBe(wire);
      const request = JSON.parse(await readFile(join(pending, 'review-request.json'), 'utf8'));
      expect(request.choices).toContain('unconfirmed'); expect(request.stageSha256).toMatch(/^[a-f0-9]{64}$/);
      const browser = await chromium.launch({ headless: true });
      let decision: string;
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
        await page.goto(pathToFileURL(join(pending, 'review.html')).href);
        expect(await page.locator('input[name=choice]:checked').count()).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.locator('input[value=confirm-aperture-host]').check();
        await page.locator('#evidence').fill('Synthetic test confirms the two given aperture endpoints.');
        const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载确认结果' }).click();
        decision = await readFile((await (await download).path())!, 'utf8');
        expect(JSON.parse(decision)).toMatchObject({ requestId: request.requestId, choice: 'confirm-aperture-host' });
      } finally { await browser.close(); }
      const answer = join(directory, 'decision.json'); await writeFile(answer, decision!);
      const ready = join(directory, 'ready'); expect(call(ready, ['--decision', answer])).toBe(0);
      const audit = JSON.parse(await readFile(join(ready, 'recovery-audit.json'), 'utf8'));
      expect(audit).toMatchObject({ status: 'ready', reviewCount: 1, automaticReviewCount: 0 });
      expect(JSON.parse(await readFile(join(ready, 'stage-0-initial.json'), 'utf8')).openingAudit[0].programStatus).toBe('unresolved-host');
      expect(JSON.parse(await readFile(join(ready, 'stage-1-reviewed.json'), 'utf8')).openingAudit[0].programStatus).toBe('assembled');
      const draft = await readFile(join(ready, 'draft.json'), 'utf8');
      expect(JSON.parse(draft).floors[0].doors).toHaveLength(1);
      expect(call(ready, ['--decision', answer])).not.toBe(0); expect(await readFile(join(ready, 'draft.json'), 'utf8')).toBe(draft);
      raster.data[0] = 0; await writeFile(source, await encodeRgbaPng(raster));
      const stale = join(directory, 'stale-source'); expect(call(stale, ['--decision', answer])).toBe(2);
      expect(JSON.parse(await readFile(join(stale, 'failure.json'), 'utf8')).message).toContain('stale');
      expect(await readFile(input, 'utf8')).toBe(wire);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30000);
});
