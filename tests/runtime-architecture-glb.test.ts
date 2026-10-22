import { describe, expect, it } from 'vitest';
import { serializeArchitectureGlb } from '$lib/runtime/architectureGlb';
import type { ArchitectureMesh, ArchitectureMeshPrimitive } from '$lib/runtime/architectureMesher';

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

function primitive(overrides: Partial<ArchitectureMeshPrimitive> = {}): ArchitectureMeshPrimitive {
  return {
    id: 'architecture:wall:wall-1',
    kind: 'wall',
    ownerId: 'wall-1',
    floorId: 'floor-1',
    positions: [[0, 0, 0], [2, 0, 0], [0, 2, 0]],
    normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
    uvs: [[0, 0], [2, 0], [0, 2]],
    indices: [0, 1, 2],
    ...overrides,
  };
}

function mesh(primitives: ArchitectureMeshPrimitive[]): ArchitectureMesh {
  return {
    units: 'metres',
    coordinates: { handedness: 'right', up: '+Y', planX: '+X', planY: '+Z', yaw: 'clockwise-from-+X' },
    primitives,
    diagnostics: [],
  };
}

function parseGlb(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);

  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(JSON_CHUNK_TYPE);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)).trimEnd());

  const binaryHeaderOffset = 20 + jsonLength;
  const binaryLength = view.getUint32(binaryHeaderOffset, true);
  expect(view.getUint32(binaryHeaderOffset + 4, true)).toBe(BIN_CHUNK_TYPE);
  const binaryOffset = binaryHeaderOffset + 8;
  expect(binaryOffset + binaryLength).toBe(bytes.byteLength);
  return { json, view, binaryOffset, binaryLength };
}

function readAccessorVec3(parsed: ReturnType<typeof parseGlb>, accessorIndex: number) {
  const accessor = parsed.json.accessors[accessorIndex];
  const bufferView = parsed.json.bufferViews[accessor.bufferView];
  const offset = parsed.binaryOffset + bufferView.byteOffset + (accessor.byteOffset ?? 0);
  return [
    parsed.view.getFloat32(offset, true),
    parsed.view.getFloat32(offset + 4, true),
    parsed.view.getFloat32(offset + 8, true),
  ];
}

describe('architecture GLB writer', () => {
  it('serializes stable Plan2World ownership and glTF geometry without engine types', () => {
    const source = mesh([
      primitive(),
      primitive({
        id: 'architecture:floor:room-1',
        kind: 'floor',
        ownerId: 'room-1',
        positions: [[0, 0, 0], [0, 0, 3], [4, 0, 0]],
        normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
        uvs: [[0, 0], [0, 3], [4, 0]],
      }),
    ]);

    const parsed = parseGlb(serializeArchitectureGlb(source));
    expect(parsed.json.asset).toMatchObject({ version: '2.0' });
    expect(parsed.json.extras.plan2world).toEqual({
      artifact: 'architecture.glb',
      units: 'metres',
      coordinates: source.coordinates,
    });
    expect(parsed.json.scenes[0].nodes).toEqual([0, 1]);
    expect(parsed.json.nodes.map((node: { name: string }) => node.name)).toEqual([
      'architecture:wall:wall-1',
      'architecture:floor:room-1',
    ]);
    expect(parsed.json.nodes[0].extras.plan2world).toEqual({
      id: 'architecture:wall:wall-1',
      kind: 'wall',
      ownerId: 'wall-1',
      floorId: 'floor-1',
    });
    expect(parsed.json.nodes[1].extras.plan2world.ownerId).toBe('room-1');
    expect(parsed.json.meshes).toHaveLength(2);
    expect(parsed.json.accessors).toHaveLength(8);
    expect(parsed.json.bufferViews).toHaveLength(8);
    expect(parsed.json.accessors[0]).toMatchObject({
      componentType: 5126,
      count: 3,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [2, 2, 0],
    });
    expect(parsed.json.accessors[3]).toMatchObject({ componentType: 5123, count: 3, type: 'SCALAR' });
    expect(readAccessorVec3(parsed, 0)).toEqual([0, 0, 0]);
    expect(parsed.json.buffers[0].byteLength).toBe(parsed.binaryLength);
  });

  it('produces byte-identical GLB output for identical ordered input', () => {
    const source = mesh([primitive()]);
    expect(Array.from(serializeArchitectureGlb(source))).toEqual(Array.from(serializeArchitectureGlb(source)));
  });

  it('rejects malformed presentation arrays instead of repairing them during serialization', () => {
    expect(() => serializeArchitectureGlb(mesh([primitive({ normals: [[0, 0, 1]] })])))
      .toThrow('normals do not match positions');
    expect(() => serializeArchitectureGlb(mesh([primitive({ indices: [0, 1, 9] })])))
      .toThrow('out-of-range index 9');
    expect(() => serializeArchitectureGlb(mesh([primitive({ indices: [0, 1] })])))
      .toThrow('indices must contain complete triangles');
  });
});
