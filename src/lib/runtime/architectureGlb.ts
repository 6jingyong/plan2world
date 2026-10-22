import type { ArchitectureMesh, ArchitectureMeshPrimitive } from './architectureMesher';
import type { RuntimeVec2, RuntimeVec3 } from './types';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;

interface GltfBufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target: number;
}

interface GltfAccessor {
  bufferView: number;
  byteOffset: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3';
  min?: number[];
  max?: number[];
}

class BinaryBuilder {
  private readonly chunks: Uint8Array[] = [];
  length = 0;

  align4() {
    const padding = (4 - this.length % 4) % 4;
    if (padding) this.append(new Uint8Array(padding));
  }

  append(bytes: Uint8Array) {
    const offset = this.length;
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
    return offset;
  }

  finish() {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

function finiteVector(vector: readonly number[]) {
  return vector.every(Number.isFinite);
}

function validatePrimitive(primitive: ArchitectureMeshPrimitive) {
  if (primitive.positions.length === 0) throw new Error(`Architecture primitive ${primitive.id} has no positions.`);
  if (primitive.normals.length !== primitive.positions.length) {
    throw new Error(`Architecture primitive ${primitive.id} normals do not match positions.`);
  }
  if (primitive.uvs.length !== primitive.positions.length) {
    throw new Error(`Architecture primitive ${primitive.id} UVs do not match positions.`);
  }
  if (primitive.indices.length === 0 || primitive.indices.length % 3 !== 0) {
    throw new Error(`Architecture primitive ${primitive.id} indices must contain complete triangles.`);
  }
  if (!primitive.positions.every(finiteVector) || !primitive.normals.every(finiteVector) || !primitive.uvs.every(finiteVector)) {
    throw new Error(`Architecture primitive ${primitive.id} contains non-finite vertex data.`);
  }
  for (const index of primitive.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= primitive.positions.length) {
      throw new Error(`Architecture primitive ${primitive.id} contains an out-of-range index ${index}.`);
    }
  }
}

function encodeFloatVectors(vectors: RuntimeVec2[] | RuntimeVec3[], width: 2 | 3) {
  const bytes = new Uint8Array(vectors.length * width * 4);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const vector of vectors) {
    for (let axis = 0; axis < width; axis += 1) {
      view.setFloat32(offset, vector[axis], true);
      offset += 4;
    }
  }
  return bytes;
}

function encodeIndices(indices: number[], componentType: typeof UNSIGNED_SHORT | typeof UNSIGNED_INT) {
  const bytesPerIndex = componentType === UNSIGNED_SHORT ? 2 : 4;
  const bytes = new Uint8Array(indices.length * bytesPerIndex);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < indices.length; index += 1) {
    if (componentType === UNSIGNED_SHORT) view.setUint16(index * 2, indices[index], true);
    else view.setUint32(index * 4, indices[index], true);
  }
  return bytes;
}

function positionBounds(positions: RuntimeVec3[]) {
  const min = [...positions[0]] as RuntimeVec3;
  const max = [...positions[0]] as RuntimeVec3;
  for (let index = 1; index < positions.length; index += 1) {
    const position = positions[index];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[axis]);
      max[axis] = Math.max(max[axis], position[axis]);
    }
  }
  return { min, max };
}

function maxIndex(indices: number[]) {
  let maximum = 0;
  for (const index of indices) maximum = Math.max(maximum, index);
  return maximum;
}

function padChunk(bytes: Uint8Array, paddingByte: number) {
  const paddedLength = bytes.byteLength + (4 - bytes.byteLength % 4) % 4;
  if (paddedLength === bytes.byteLength) return bytes;
  const result = new Uint8Array(paddedLength);
  result.set(bytes);
  result.fill(paddingByte, bytes.byteLength);
  return result;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, true);
}

/**
 * Serialize engine-neutral architecture presentation geometry as a deterministic
 * glTF 2.0 binary. Runtime semantics remain in plan2world-runtime-v1; stable
 * Plan2World ownership is carried only as GLB node extras for renderer lookup.
 */
export function serializeArchitectureGlb(mesh: ArchitectureMesh): Uint8Array {
  const binary = new BinaryBuilder();
  const bufferViews: GltfBufferView[] = [];
  const accessors: GltfAccessor[] = [];
  const gltfMeshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];

  const addBufferView = (bytes: Uint8Array, target: number) => {
    binary.align4();
    const byteOffset = binary.append(bytes);
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
    return index;
  };

  const addAccessor = (accessor: GltfAccessor) => {
    const index = accessors.length;
    accessors.push(accessor);
    return index;
  };

  for (const primitive of mesh.primitives) {
    validatePrimitive(primitive);

    const positionView = addBufferView(encodeFloatVectors(primitive.positions, 3), ARRAY_BUFFER);
    const normalView = addBufferView(encodeFloatVectors(primitive.normals, 3), ARRAY_BUFFER);
    const uvView = addBufferView(encodeFloatVectors(primitive.uvs, 2), ARRAY_BUFFER);
    const indexComponentType = maxIndex(primitive.indices) <= 0xffff ? UNSIGNED_SHORT : UNSIGNED_INT;
    const indexView = addBufferView(encodeIndices(primitive.indices, indexComponentType), ELEMENT_ARRAY_BUFFER);
    const bounds = positionBounds(primitive.positions);

    const positionAccessor = addAccessor({
      bufferView: positionView,
      byteOffset: 0,
      componentType: FLOAT,
      count: primitive.positions.length,
      type: 'VEC3',
      min: bounds.min,
      max: bounds.max,
    });
    const normalAccessor = addAccessor({
      bufferView: normalView,
      byteOffset: 0,
      componentType: FLOAT,
      count: primitive.normals.length,
      type: 'VEC3',
    });
    const uvAccessor = addAccessor({
      bufferView: uvView,
      byteOffset: 0,
      componentType: FLOAT,
      count: primitive.uvs.length,
      type: 'VEC2',
    });
    const indexAccessor = addAccessor({
      bufferView: indexView,
      byteOffset: 0,
      componentType: indexComponentType,
      count: primitive.indices.length,
      type: 'SCALAR',
    });

    const meshIndex = gltfMeshes.length;
    gltfMeshes.push({
      name: primitive.id,
      primitives: [{
        attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: uvAccessor },
        indices: indexAccessor,
        mode: TRIANGLES,
      }],
    });
    nodes.push({
      name: primitive.id,
      mesh: meshIndex,
      extras: {
        plan2world: {
          id: primitive.id,
          kind: primitive.kind,
          ownerId: primitive.ownerId,
          floorId: primitive.floorId,
        },
      },
    });
  }

  binary.align4();
  const binaryChunk = binary.finish();
  const gltf = {
    asset: { version: '2.0', generator: 'Plan2World architecture GLB writer' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryChunk.byteLength }],
    extras: {
      plan2world: {
        artifact: 'architecture.glb',
        units: mesh.units,
        coordinates: mesh.coordinates,
      },
    },
  };

  const jsonChunk = padChunk(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const paddedBinaryChunk = padChunk(binaryChunk, 0);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + paddedBinaryChunk.byteLength;
  const result = new Uint8Array(totalLength);

  writeUint32(result, 0, GLB_MAGIC);
  writeUint32(result, 4, GLB_VERSION);
  writeUint32(result, 8, totalLength);
  writeUint32(result, 12, jsonChunk.byteLength);
  writeUint32(result, 16, JSON_CHUNK_TYPE);
  result.set(jsonChunk, 20);
  const binaryHeaderOffset = 20 + jsonChunk.byteLength;
  writeUint32(result, binaryHeaderOffset, paddedBinaryChunk.byteLength);
  writeUint32(result, binaryHeaderOffset + 4, BIN_CHUNK_TYPE);
  result.set(paddedBinaryChunk, binaryHeaderOffset + 8);
  return result;
}
