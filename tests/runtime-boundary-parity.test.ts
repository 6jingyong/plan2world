import { describe, expect, it } from 'vitest';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { readProject } from '$lib/utils/projectValidation';
import { runtimeWalkthroughProject } from '../tooling/runtime-walkthrough-fixture.mjs';

describe('native runtime boundary parity', () => {
  it('keeps railings visible at authored height and air invisible without altering their collision', async () => {
    const project = readProject(await runtimeWalkthroughProject());
    const before = structuredClone(project);
    const compiled = await compileRuntimeArtifacts(project, async () => null);
    const rail = compiled.runtime.entities.find(e => e.id === 'railing');
    const air = compiled.runtime.entities.find(e => e.id === 'air');
    expect(rail).toMatchObject({ kind: 'wall', boundaryType: 'railing', visible: true, startHeight: 1.1, endHeight: 1.1 });
    expect(air).toMatchObject({ kind: 'wall', boundaryType: 'air', visible: false });
    const railMesh = compiled.architecture.primitives.find(p => p.ownerId === 'railing')!;
    expect(railMesh.kind).toBe('wall');
    expect(Math.min(...railMesh.positions.map(p => p[1]))).toBeCloseTo(0.4);
    expect(Math.max(...railMesh.positions.map(p => p[1]))).toBeCloseTo(1.5);
    expect(compiled.architecture.primitives.some(p => p.ownerId === 'air')).toBe(false);
    expect(compiled.runtime.colliders.filter(c => c.ownerId === 'railing')).toEqual([expect.objectContaining({ kind: 'box', dynamic: false, size: [4, 1.1, 0.15] })]);
    expect(compiled.runtime.colliders.filter(c => c.ownerId === 'air')).toEqual([expect.objectContaining({ kind: 'box', dynamic: false, size: [4, 3, 0.15] })]);
    expect(compiled.architecture.diagnostics.some(d => d.code === 'unsupported-wall-boundary')).toBe(false);
    // Visibility and asset availability cannot change compiler physics.
    project.floors[0].walls.find(w => w.id === 'railing')!.boundaryType = 'air';
    const hidden = await compileRuntimeArtifacts(project, async () => null);
    expect(hidden.runtime.colliders).toEqual(compiled.runtime.colliders);
    expect(hidden.architecture.primitives.some(p => p.ownerId === 'railing')).toBe(false);
    project.floors[0].walls.find(w => w.id === 'railing')!.boundaryType = 'railing';
    expect(project).toEqual(before);
    const repeated = await compileRuntimeArtifacts(project, async () => null);
    expect(repeated.runtime).toEqual(compiled.runtime);
    expect(repeated.architectureGlb).toEqual(compiled.architectureGlb);
  });
});
