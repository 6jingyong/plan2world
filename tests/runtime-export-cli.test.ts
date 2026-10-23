import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('runtime export CLI', () => {
  it('compiles a serialized native Project into runtime JSON and architecture GLB', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'plan2world-runtime-'));
    const input = path.join(dir, 'house.project.json');
    const runtimeOutput = path.join(dir, 'house.runtime.json');
    const architectureOutput = path.join(dir, 'house.architecture.glb');
    const nativeProject = {
      id: 'project-cli',
      name: 'CLI runtime fixture',
      activeFloorId: 'floor-1',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      floors: [{
        id: 'floor-1',
        name: 'Ground',
        level: 0,
        walkthroughStart: { x: 100, y: 100 },
        walls: [
          { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, height: 280 },
          { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 20, height: 280 },
          { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 20, height: 280 },
          { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 20, height: 280 },
        ],
        doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 90 }],
        windows: [],
        furniture: [],
        stairs: [],
        columns: [],
        rooms: [],
        guides: [],
        measurements: [],
        annotations: [],
        textAnnotations: [],
        groups: [],
      }],
    };

    try {
      await writeFile(input, JSON.stringify(nativeProject), 'utf8');
      const stdout = execFileSync(process.execPath, ['tooling/runtime-export.mjs', input, runtimeOutput], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      const runtime = JSON.parse(await readFile(runtimeOutput, 'utf8'));
      const glb = await readFile(architectureOutput);

      expect(stdout).toContain('plan2world-runtime-v1');
      expect(stdout).toContain('architecture.glb');
      expect(runtime.schema).toBe('plan2world-runtime-v1');
      expect(runtime.floors[0].id).toBe('floor-1');
      expect(runtime.entities.some((entity: { id: string }) => entity.id === 'w1')).toBe(true);
      const door = runtime.entities.find((entity: { id: string }) => entity.id === 'd1');
      expect(door?.hostWallId).toBe('w1');
      expect(door?.interaction?.kind).toBe('swing');
      expect(runtime.colliders.some((collider: { ownerId: string }) => collider.ownerId === 'd1')).toBe(true);
      expect(glb.readUInt32LE(0)).toBe(0x46546c67);
      expect(glb.readUInt32LE(4)).toBe(2);
      expect(glb.readUInt32LE(8)).toBe(glb.byteLength);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
