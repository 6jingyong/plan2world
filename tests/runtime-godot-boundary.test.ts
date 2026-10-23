import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Godot runtime adapter boundaries', () => {
  it('keeps artifact loading separate from runtime assembly', () => {
    const artifacts = read('runtime/godot/scripts/runtime_artifacts.gd');

    expect(artifacts).toContain('FileAccess.open(');
    expect(artifacts).toContain('GLTFDocument.new()');
    expect(artifacts).not.toContain('StaticBody3D.new()');
    expect(artifacts).not.toContain('MeshInstance3D.new()');
  });

  it('keeps the runtime loader presentation-free while consuming explicit physics geometry', () => {
    const loader = read('runtime/godot/scripts/runtime_loader.gd');

    expect(loader).not.toContain('MeshInstance3D');
    expect(loader).not.toContain('BoxMesh');
    expect(loader).not.toContain('CylinderMesh');
    expect(loader).not.toContain('StandardMaterial3D');
    expect(loader).not.toContain('architecture_presentation_loaded');
    expect(loader).toContain('"collider_nodes"');
    expect(loader).toContain('ConcavePolygonShape3D.new()');
    expect(loader).toContain('"triangle-mesh"');
  });

  it('keeps fallback presentation out of physics assembly and reuses runtime triangles', () => {
    const renderer = read('runtime/godot/scripts/runtime_proxy_renderer.gd');

    expect(renderer).not.toContain('StaticBody3D.new()');
    expect(renderer).not.toContain('CollisionShape3D.new()');
    expect(renderer).toContain('collider_nodes');
    expect(renderer).toContain('architecture_presentation_loaded');
    expect(renderer).toContain('SurfaceTool.new()');
    expect(renderer).toContain('"triangle-mesh"');
    expect(renderer).not.toContain('Geometry2D.triangulate_polygon');
  });

  it('keeps swing and slide motion in the same engine-side door component', () => {
    const door = read('runtime/godot/scripts/door.gd');
    const loader = read('runtime/godot/scripts/runtime_loader.gd');

    expect(door).toContain('configure_swing');
    expect(door).toContain('configure_slide');
    expect(door).toContain('AnimatableBody3D');
    expect(loader).toContain('"swing": return _build_swing_door');
    expect(loader).toContain('"slide": return _build_slide_door');
    expect(loader).toContain('Unsupported source motion stays an explicit closed blocker');
  });

  it('uses grounded CharacterBody motion instead of locking player elevation', () => {
    const player = read('runtime/godot/scripts/player.gd');

    expect(player).toContain('physics/3d/default_gravity');
    expect(player).toContain('floor_snap_length');
    expect(player).toContain('is_on_floor()');
    expect(player).not.toContain('_locked_y');
    expect(player).not.toContain('global_position.y =');
  });

  it('keeps the built-in demo on the compiled runtime physics contract', () => {
    const demo = JSON.parse(read('runtime/godot/demo/runtime-scene.json')) as {
      colliders: { id?: string; kind?: string }[];
      entities: { kind?: string; interaction?: { kind?: string }; traversal?: { kind?: string } }[];
    };
    expect(demo.colliders.some(collider => collider.kind === 'triangle-mesh')).toBe(true);
    const motions = demo.entities
      .filter(entity => entity.kind === 'door')
      .map(entity => entity.interaction?.kind);
    expect(motions).toContain('swing');
    expect(motions).toContain('slide');
    expect(demo.entities.some(entity => entity.kind === 'stair' && entity.traversal?.kind === 'ramp')).toBe(true);
    expect(demo.colliders.some(collider => collider.id?.startsWith('stair:') && collider.kind === 'triangle-mesh')).toBe(true);
  });

  it('keeps main as an explicit composition root', () => {
    const main = read('runtime/godot/scripts/main.gd');

    expect(main).toContain('RUNTIME_ARTIFACTS');
    expect(main).toContain('RUNTIME_LOADER');
    expect(main).toContain('RUNTIME_PROXY_RENDERER');
    expect(main).not.toContain('GLTFDocument.new()');
    expect(main).not.toContain('FileAccess.open(');
    expect(main).not.toContain('StaticBody3D.new()');
    expect(main).not.toContain('MeshInstance3D.new()');
  });
});
