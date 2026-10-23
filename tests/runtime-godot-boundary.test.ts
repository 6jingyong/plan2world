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

  it('keeps the runtime loader presentation-free', () => {
    const loader = read('runtime/godot/scripts/runtime_loader.gd');

    expect(loader).not.toContain('MeshInstance3D');
    expect(loader).not.toContain('BoxMesh');
    expect(loader).not.toContain('CylinderMesh');
    expect(loader).not.toContain('StandardMaterial3D');
    expect(loader).not.toContain('architecture_presentation_loaded');
    expect(loader).toContain('"collider_nodes"');
  });

  it('keeps fallback presentation out of physics assembly', () => {
    const renderer = read('runtime/godot/scripts/runtime_proxy_renderer.gd');

    expect(renderer).not.toContain('StaticBody3D.new()');
    expect(renderer).not.toContain('CollisionShape3D.new()');
    expect(renderer).toContain('collider_nodes');
    expect(renderer).toContain('architecture_presentation_loaded');
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
