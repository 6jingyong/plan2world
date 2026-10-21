import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';

// A floor's visible extent must follow its native footprint at any world origin.
// Export-only slab checks cannot catch a viewer-owned plane outside that footprint.
test('3D keeps the ground in an L-shaped recess when the plan is translated', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-3d', 'first-export']));
    const seen = new WeakSet(), getContext = HTMLCanvasElement.prototype.getContext;
    (window as any).__floorView = {};
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
      const gl = (getContext as any).apply(this, args);
      if (!gl || !String(args[0]).startsWith('webgl') || seen.has(gl)) return gl;
      seen.add(gl);
      const names = new Map(), locate = gl.getUniformLocation.bind(gl), matrix = gl.uniformMatrix4fv.bind(gl);
      gl.getUniformLocation = (program: WebGLProgram, name: string) => {
        const location = locate(program, name); if (location) names.set(location, name); return location;
      };
      gl.uniformMatrix4fv = (location: WebGLUniformLocation, transpose: boolean, values: Float32Array, ...rest: any[]) => {
        const name = names.get(location);
        if (name === 'viewMatrix' || name === 'projectionMatrix') (window as any).__floorView[name] = Array.from(values);
        return matrix(location, transpose, values, ...rest);
      };
      return gl;
    } as typeof getContext;
  });
  const template = JSON.parse(await readFile('tests/fixtures/room-slabs.openplan.json', 'utf8'));
  const samples: { shift: number; rgb: number[] }[] = [];
  await page.goto('/editor');
  for (const shift of [0, 5000]) {
    const project = structuredClone(template);
    project.id = `qa-floor-origin-${shift}`;
    project.floors = [project.floors[0]];
    for (const wall of project.floors[0].walls) for (const point of [wall.start, wall.end]) { point.x += shift; point.y += shift; }
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'floor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('button', { name: 'Top-Down View', exact: true }).click();
    const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').first();
    await expect(canvas).toHaveAttribute('data-rendered', 'true');
    await page.evaluate(() => new Promise<void>(resolve => {
      let frames = 20; const settle = () => --frames ? requestAnimationFrame(settle) : resolve(); requestAnimationFrame(settle);
    }));
    const matrices = await page.evaluate(() => (window as any).__floorView);
    const clip = new Vector3(400 + shift, 0, 400 + shift)
      .applyMatrix4(new Matrix4().fromArray(matrices.viewMatrix))
      .applyMatrix4(new Matrix4().fromArray(matrices.projectionMatrix));
    expect(Math.abs(clip.x)).toBeLessThan(.9); expect(Math.abs(clip.y)).toBeLessThan(.9);
    const rgb = await canvas.evaluate((source: HTMLCanvasElement, clip) => {
      const copy = document.createElement('canvas'); copy.width = source.width; copy.height = source.height;
      const context = copy.getContext('2d')!; context.drawImage(source, 0, 0);
      const x = Math.round((clip.x + 1) / 2 * copy.width), y = Math.round((1 - clip.y) / 2 * copy.height);
      const pixels = context.getImageData(x - 3, y - 3, 7, 7).data, sum = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += pixels[i + c];
      return sum.map(value => value / 49);
    }, { x: clip.x, y: clip.y });
    samples.push({ shift, rgb });
    await testInfo.attach(`recess-origin-${shift}`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  await testInfo.attach('recess-colours', { body: JSON.stringify(samples), contentType: 'application/json' });
  // 5000 cm is an exact multiple of the ground texture repeat. Both views show
  // the same unshadowed concrete in the recess, independent of the plan origin.
  expect(Math.hypot(...samples[0].rgb.map((value, i) => value - samples[1].rgb[i]))).toBeLessThan(8);
});
