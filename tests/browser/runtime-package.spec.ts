import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { runtimeAssetProject } from '../../tooling/runtime-asset-fixture.mjs';
import { runtimeProductProject } from '../../tooling/runtime-product-fixture.mjs';

async function importFixture(page: Page, supplied?: { name: string }) {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  const source = supplied ?? await runtimeAssetProject();
  await (await chooser).setFiles({ name: '家 居.project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await expect(page.getByRole('button', { name: source.name, exact: true })).toBeVisible();
}

async function download(page: Page, name: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return readFile((await (await pending).path())!);
}

for (const width of [1440, 390]) test(`runtime scene export matches the CLI and preserves the native Project at ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== 'http://127.0.0.1:4188') external.push(request.url());
  });
  await page.setViewportSize({ width, height: 720 });
  await importFixture(page);
  const before = await download(page, 'Download JSON');
  const first = await download(page, 'Export runtime scene (.zip)');
  expect(await download(page, 'Export runtime scene (.zip)')).toEqual(first);
  expect(JSON.parse((await download(page, 'Download JSON')).toString())).toEqual(JSON.parse(before.toString()));
  const directory = await mkdtemp(path.join(tmpdir(), 'plan2world-browser-runtime-'));
  try {
    const input = path.join(directory, 'native.project.json'), zipPath = path.join(directory, 'scene.zip');
    await writeFile(input, before);
    execFileSync(process.execPath, ['tooling/runtime-export.mjs', input, '--package', zipPath], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' });
    expect(first).toEqual(await readFile(zipPath));
    const zip = await JSZip.loadAsync(first, { checkCRC32: true });
    const manifest = JSON.parse(await zip.file('scene.assets/manifest.json')!.async('text'));
    expect(manifest.assets.map((asset: { id: string }) => asset.id)).toContain('custom-model:box');
    expect(manifest.assets.map((asset: { id: string }) => asset.id)).toContain('catalog:sofa');
    const notes = await zip.file('README.txt')!.async('text');
    expect(notes).toContain('Unsupported door motion:');
    expect(notes).toContain('Missing presentation asset: catalog:imported_object');
    await testInfo.attach('runtime-scene.zip', { body: first, contentType: 'application/zip' });
  } finally { await rm(directory, { recursive: true, force: true }); }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('asset request failure reports an error and allows a successful retry', async ({ page }) => {
  await importFixture(page);
  await page.route('**/models/*.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Export runtime scene (.zip)', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t export runtime scene');
  await expect(page.getByRole('alert')).toContainText('503');
  await page.getByRole('button', { name: 'Dismiss runtime export error', exact: true }).click();
  await page.unroute('**/models/*.glb');
  const zip = await JSZip.loadAsync(await download(page, 'Export runtime scene (.zip)'));
  expect(zip.file('scene.runtime.json')).not.toBeNull();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('invalid native floor blocks runtime download while preserving editable JSON', async ({ page }) => {
  const original = await runtimeAssetProject();
  const source = { ...original, floors: [{ ...original.floors[0], rooms: [{
    id: 'invalid-ground', name: 'Invalid ground', walls: [], area: 0, floorTexture: 'concrete',
    boundary: [[100, 100], [400, 400], [100, 400], [400, 100]].map(([x, y]) => ({ point: { x, y } })),
  }] }, ...original.floors.slice(1)] };
  await importFixture(page, source);
  const before = await download(page, 'Download JSON');
  const downloads: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Export runtime scene (.zip)', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t export runtime scene');
  await expect(page.getByRole('alert')).toContainText('floor "ground" room "invalid-ground"');
  expect(downloads).toEqual([]);
  expect(JSON.parse((await download(page, 'Download JSON')).toString())).toEqual(JSON.parse(before.toString()));
  await page.getByRole('button', { name: 'Dismiss runtime export error', exact: true }).click();
  const recovered = { ...original, id: 'runtime-assets-recovered', name: 'Recovered runtime scene' };
  await importFixture(page, recovered);
  const zip = await JSZip.loadAsync(await download(page, 'Export runtime scene (.zip)'));
  expect(JSON.parse(await zip.file('scene.runtime.json')!.async('text')).source.projectId).toBe(recovered.id);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('doorway furniture blocks runtime export while preserving native data for correction', async ({ page }) => {
  const project=await runtimeProductProject();
  project.floors[0].furniture.find((item: {id:string})=>item.id==='sofa').position={x:300,y:600};
  await importFixture(page,{...project,name:'Doorway conflict'});
  const before=await download(page,'Download JSON'), downloads: string[]=[];
  page.on('download',download=>downloads.push(download.suggestedFilename()));
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('button',{name:'Export runtime scene (.zip)',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Furniture "sofa" overlaps the closed pose of door "swing-door"');
  expect(downloads).toEqual([]);
  expect(JSON.parse((await download(page,'Download JSON')).toString())).toEqual(JSON.parse(before.toString()));
  await page.getByRole('button',{name:'Dismiss runtime export error',exact:true}).click();
  const corrected={...await runtimeProductProject(),id:'runtime-doorway-corrected',name:'Doorway corrected in native authoring'};
  await importFixture(page,corrected);
  const zip=await JSZip.loadAsync(await download(page,'Export runtime scene (.zip)'));
  expect(zip.file('scene.runtime.json')).not.toBeNull();
  await expect(page.getByRole('alert')).toHaveCount(0);
});


for (const width of [1440,390]) test(`explicit main entrance saves native identity and compiles an inward-facing start at ${width}px`, async ({ page }) => {
  await page.setViewportSize({width,height:900});
  const project: Record<string, any> & { name: string }={...await runtimeProductProject(),name:'Main entrance authoring'};
  delete project.floors[0].entrance;
  project.floors[0].walkthroughStart={x:300,y:800};
  await importFixture(page,project);
  await page.getByLabel('Main entrance door',{exact:true}).selectOption('main-entry');
  await expect(page.getByLabel('Entrance inward side',{exact:true})).toHaveValue('left');
  const bounds=await page.getByLabel('Entrance inward side',{exact:true}).boundingBox();
  expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  const saved=JSON.parse((await download(page,'Download JSON')).toString());
  expect(saved.floors[0].entrance).toEqual({doorId:'main-entry',side:'left'});
  expect(saved.floors[0].walkthroughStart).toBeUndefined();
  const zip=await JSZip.loadAsync(await download(page,'Export runtime scene (.zip)'));
  const runtime=JSON.parse(await zip.file('scene.runtime.json')!.async('text'));
  expect(runtime.floors[0]).toMatchObject({entranceDoorId:'main-entry',walkthroughStart:[3,.4,.5],walkthroughYawClockwiseRadians:Math.PI/2});
  await page.getByLabel('Clear first-person walkthrough start',{exact:true}).click();
  await expect(page.getByLabel('Entrance inward side',{exact:true})).toHaveCount(0);
  expect(JSON.parse((await download(page,'Download JSON')).toString()).floors[0].entrance).toBeUndefined();
});
