import { describe, expect, it } from 'vitest';
import { applyFurnitureLayoutCommand, furnitureLayoutCatalog } from '$lib/runtime/furnitureLayout';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { readProject } from '$lib/utils/projectValidation';
import { readProjectPackage, projectPackageBytes } from '$lib/utils/projectPackageCodec';
import { runtimeWalkthroughProject } from '../tooling/runtime-walkthrough-fixture.mjs';

const now = new Date('2026-10-25T00:00:00Z');
const architecture = (p: ReturnType<typeof readProject>) => p.floors.map(({ furniture, groups, ...floor }) => floor);
describe('shared native furniture layout commands', () => {
  it('adds/moves/rotates/replaces/removes with stable IDs, unchanged source and architecture', async () => {
    const input = readProject(await runtimeWalkthroughProject()), snapshot = JSON.stringify(input);
    const floorId = input.floors[0].id;
    const added = applyFurnitureLayoutCommand(input, { type: 'add', floorId, position: { x: 600, y: 500 }, asset: { catalogId: 'sofa' } }, now);
    const id = added.selectedId!;
    expect(architecture(added.project)).toEqual(architecture(input));
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(applyFurnitureLayoutCommand(input, { type: 'add', floorId, position: { x: 600, y: 500 }, asset: { catalogId: 'sofa' } }, now)).toEqual(added);
    const moved = applyFurnitureLayoutCommand(added.project, { type: 'move', floorId, id, position: { x: 700, y: 550 } }, now);
    const rotated = applyFurnitureLayoutCommand(moved.project, { type: 'rotate', floorId, id, rotation: 90 }, now);
    const replaced = applyFurnitureLayoutCommand(rotated.project, { type: 'replace', floorId, id, asset: { catalogId: 'chair' } }, now);
    const item = replaced.project.floors[0].furniture.find(i => i.id === id)!;
    expect(item).toMatchObject({ id, catalogId: 'chair', position: { x: 700, y: 550 }, rotation: 90 });
    const before = await compileRuntimeArtifacts(input, async () => null), after = await compileRuntimeArtifacts(replaced.project, async () => null);
    expect(after.architectureGlb).toEqual(before.architectureGlb);
    expect(after.runtime.entities.filter(e => e.kind !== 'furniture')).toEqual(before.runtime.entities.filter(e => e.kind !== 'furniture'));
    expect(after.runtime.colliders.find(c => c.ownerId === id)).toMatchObject({ center: [7, 0.85, 5.5], size: [0.8, 0.9, 0.8], yawClockwiseRadians: Math.PI / 2 });
    const removed = applyFurnitureLayoutCommand(replaced.project, { type: 'remove', floorId, id }, now);
    expect(removed.project.floors[0].furniture).toEqual(input.floors[0].furniture);
    expect(removed.selectedId).toBeNull();
  });

  it('accepts a wall-aligned floor pose atomically, with deterministic collision and no mount inference', async () => {
    const input = readProject(await runtimeWalkthroughProject()), snapshot = JSON.stringify(input);
    const command = { type: 'move', floorId: 'ground', id: 'sofa', position: { x: 700, y: 550 }, rotation: 37 } as const;
    const a = applyFurnitureLayoutCommand(input, command, now), b = applyFurnitureLayoutCommand(input, command, now);
    expect(a).toEqual(b);
    expect(a.project.floors[0].furniture.find(i => i.id === 'sofa')).toMatchObject({ position: command.position, rotation: 37 });
    expect(a.project.floors[0].furniture.find(i => i.id === 'sofa')).not.toHaveProperty('wallMount');
    const first = await compileRuntimeArtifacts(a.project, async () => null), second = await compileRuntimeArtifacts(b.project, async () => null);
    expect(first).toEqual(second);
    expect(first.runtime.colliders.find(c => c.ownerId === 'sofa')).toMatchObject({ center: [7, .9, 5.5], yawClockwiseRadians: 37 * Math.PI / 180 });
    expect(first.architectureGlb).toEqual((await compileRuntimeArtifacts(input, async () => null)).architectureGlb);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(() => applyFurnitureLayoutCommand(input, { ...command, rotation: NaN }, now)).toThrow('finite');
    const mounted = applyFurnitureLayoutCommand(input, { type:'add', floorId:'ground', position:{x:700,y:0}, asset:{catalogId:'wall_art'}, wallMount:{wallId:'ground-w0',side:'left',elevation:140} }, now);
    expect(() => applyFurnitureLayoutCommand(mounted.project, { ...command, id: mounted.selectedId! }, now)).toThrow('authored wall');
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('rejects invalid positions/assets/ownership without mutating input', async () => {
    const input = readProject(await runtimeWalkthroughProject()), before = JSON.stringify(input), floorId = input.floors[0].id;
    for (const command of [
      { type: 'add', floorId, position: { x: NaN, y: 5 }, asset: { catalogId: 'chair' } },
      { type: 'add', floorId, position: { x: 5, y: 5 }, asset: { catalogId: 'missing' } },
      { type: 'remove', floorId, id: 'not-a-furniture-id' },
      { type: 'add', floorId: 'missing', position: { x: 5, y: 5 }, asset: { catalogId: 'chair' } },
      { type: 'add', floorId, position: { x: 5, y: 5 }, asset: { catalogId: 'custom-model', customModelId: 'missing' } },
    ] as const) expect(() => applyFurnitureLayoutCommand(input, command, now)).toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('retains custom attachments and semantics through replacement, native save and package roundtrip', async () => {
    const input = readProject(await runtimeWalkthroughProject());
    const floor = input.floors[0];
    const original = floor.furniture.find(i => i.id === 'custom')!;
    original.sourceCategory = 'source-observed furniture';
    const replaced = applyFurnitureLayoutCommand(input, { type: 'replace', floorId: floor.id, id: original.id, asset: { catalogId: 'custom-model', customModelId: 'box' } }, now);
    const json = readProject(JSON.parse(JSON.stringify(replaced.project)));
    const reopened = readProjectPackage(projectPackageBytes(json)).project;
    expect(reopened.customModels).toEqual(input.customModels);
    expect(reopened.projectPackage!.assets).toEqual(input.projectPackage!.assets);
    expect(reopened.floors[0].furniture.find(i => i.id === original.id)).toMatchObject({
      id: original.id, position: original.position, rotation: original.rotation,
      customModelId: 'box', sourceCategory: original.sourceCategory, scale: { x: 1, y: 1, z: 1 },
    });
    const catalog = applyFurnitureLayoutCommand(reopened, { type: 'replace', floorId: floor.id, id: original.id, asset: { catalogId: 'chair' } }, now);
    const chair = catalog.project.floors[0].furniture.find(i => i.id === original.id)!;
    expect(chair).not.toHaveProperty('customModelId');
    expect(chair).not.toHaveProperty('width');
    expect(catalog.project.projectPackage!.assets).toEqual(input.projectPackage!.assets);
  });

  it('projects a deterministic visual catalog without changing native data or runtime artifacts', async () => {
    const input = readProject(await runtimeWalkthroughProject()), before = JSON.stringify(input);
    const catalog = furnitureLayoutCatalog(input);
    expect(catalog).toEqual(furnitureLayoutCatalog(input));
    expect(catalog.find(i => i.asset.catalogId === 'sofa')).toMatchObject({
      label: 'Sofa', category: 'Living Room', dimensions: [200, 90, 80], mounting: 'floor',
    });
    expect(catalog.find(i => i.asset.customModelId === 'box')).toMatchObject({
      category: 'Custom models', dimensions: [100, 75, 50],
    });
    for (const item of catalog) {
      expect(item.symbolSvg).toContain('viewBox="-36 -36 72 72"');
      expect(item.symbolSvg).not.toMatch(/NaN|Infinity|<image|href=|undefined|="#([0-9a-f]{8})"/i);
    }
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify((await compileRuntimeArtifacts(input, async () => null)).runtime)).not.toMatch(/symbolSvg|dimensions|Custom models/);
  });

  it('honors locks and cleans group membership when furniture is removed', async () => {
    const input = readProject(await runtimeWalkthroughProject()), floor = input.floors[0];
    floor.groups = [{ id: 'layout-group', elementIds: ['sofa', 'custom'] }];
    const locked = structuredClone(input);
    locked.floors[0].furniture[0].locked = true;
    expect(() => applyFurnitureLayoutCommand(locked, { type: 'remove', floorId: floor.id, id: 'sofa' }, now)).toThrow('locked');
    const removed = applyFurnitureLayoutCommand(input, { type: 'remove', floorId: floor.id, id: 'sofa' }, now);
    expect(removed.project.floors[0].groups).toEqual([]);
    expect(input.floors[0].groups).toHaveLength(1);
  });
});
