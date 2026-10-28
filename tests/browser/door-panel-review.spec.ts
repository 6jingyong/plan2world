import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { compileRuntimeDoor } from '../../src/lib/runtime/doorCompilation';
import { slidingDoorPreset } from '../../src/lib/utils/doorLeaves';

for (const variant of ['sliding', 'paired', 'curved-stacked'] as const) {
  test(`3D review displays compiler-owned ${variant} door parts`, async ({ page }, testInfo) => {
    const project = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
    const floor = project.floors[0], wall = floor.walls[0];
    const door = { ...floor.doors[0], wallId: wall.id, position: variant === 'curved-stacked' ? .37 : .5, width: 300, height: 210,
      type: variant === 'paired' ? 'double' : 'sliding',
      leafConfiguration: variant === 'paired' ? { kind: 'paired', firstLeafRatio: .3 } : slidingDoorPreset(300, 'three-track') };
    floor.doors = [door]; floor.windows = [];
    if (variant === 'curved-stacked') {
      wall.curvePoint = { x: 300.25, y: 100 };
      const ids = new Set([floor.id, ...Object.values(floor).flatMap(value => Array.isArray(value) ? value.flatMap(item => item?.id ? [item.id] : []) : [])]);
      const upper = JSON.parse(JSON.stringify(floor), (_key, value) => typeof value === 'string' && ids.has(value) ? `${value}-upper` : value);
      upper.name = 'Upper floor'; upper.level = 1; upper.elevation = 350;
      project.floors.push(upper);
    }
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/editor');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'door-review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await expect(page.getByRole('button', { name: project.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').last()).toHaveAttribute('data-rendered', 'true');
    const snapshot = async () => {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export Blender Scene', exact: true }).click();
      const scene = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
      await testInfo.attach('displayed-door-geometry', { body: JSON.stringify(scene), contentType: 'application/json' });
      return scene;
    };
    const point = (p: { x: number; y: number }): [number, number] => [p.x * .01, p.y * .01];
    const { interaction } = compileRuntimeDoor(floor.id, 0, door, {
      id: wall.id, floorId: floor.id, kind: 'wall', path: { start: point(wall.start), end: point(wall.end), ...(wall.curvePoint ? { control: point(wall.curvePoint) } : {}) },
      thickness: wall.thickness * .01, startHeight: wall.height * .01, endHeight: wall.height * .01, boundaryType: 'solid', visible: true,
    }).entity;
    if (!('leaves' in interaction)) throw Error('Expected explicit leaves');
    const leaves = interaction.leaves;
    function check(scene: any, elevation = 0) {
      for (const leaf of leaves) {
        const center = [...leaf.closedPose.center]; center[1] += elevation;
        const c = Math.cos(leaf.closedPose.yawClockwiseRadians), s = Math.sin(leaf.closedPose.yawClockwiseRadians);
        const matches = scene.meshes.filter((mesh: any) => {
          if (mesh.material !== 'proxy') return false;
          const local = mesh.vertices.map((v: number[]) => [(v[0] - center[0]) * c + (v[2] - center[2]) * s, v[1] - center[1], -(v[0] - center[0]) * s + (v[2] - center[2]) * c]);
          return [0, 1, 2].every(axis => Math.abs(Math.min(...local.map((v: number[]) => v[axis])) + leaf.size[axis] / 2) < 1e-5 && Math.abs(Math.max(...local.map((v: number[]) => v[axis])) - leaf.size[axis] / 2) < 1e-5);
        });
        expect(matches, `Displayed closed part ${leaf.id} at elevation ${elevation}`).toHaveLength(1);
      }
    }
    check(await snapshot());
    if (variant === 'curved-stacked') {
      await page.getByRole('button', { name: 'Show All Floors Stacked', exact: true }).click();
      const stacked = await snapshot(); check(stacked); check(stacked, 3.5);
    }
    await page.getByRole('region', { name: '3D floor plan viewer' }).screenshot({ path: testInfo.outputPath('door-review.png') });
    expect(errors).toEqual([]);
  });
}
