import { readLocalGLB } from '../utils/localGLB';
import { validateLocalGLBExtensions } from '../utils/localGLBExtensions';
import { validateLocalGLBMaterials } from '../utils/localGLBMaterials';
import { validateLocalGLBGeometry } from '../utils/localGLBGeometry';
import { validateStaticLocalGLBScene } from '../utils/localGLBScene';
import { visitValidatedLocalGLBAccessor } from '../utils/localGLBAccessors';
import type { RuntimeVec3 } from './types';

export interface AssetNormalization { translation: RuntimeVec3; scale: RuntimeVec3 }
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: number[], b: number[]) {
  return a.map((_, i) => {
    const row = i % 4, col = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row] * b[col * 4 + k], 0);
  });
}
function nodeMatrix(node: Record<string, any>) {
  if (node.matrix) return node.matrix as number[];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1], t = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y*y + z*z))*s[0], 2*(x*y + z*w)*s[0], 2*(x*z - y*w)*s[0], 0,
    2*(x*y - z*w)*s[1], (1 - 2*(x*x + z*z))*s[1], 2*(y*z + x*w)*s[1], 0,
    2*(x*z + y*w)*s[2], 2*(y*z - x*w)*s[2], (1 - 2*(x*x + y*y))*s[2], 0,
    ...t, 1,
  ];
}

/** Compiler-owned fit from actual active-scene vertices (including static morph
 * weights and nested transforms). Engines apply this affine transform verbatim;
 * they never measure a mesh to recover placement, dimensions or physics. */
export function compileAssetNormalization(bytes: Uint8Array): AssetNormalization {
  const container = readLocalGLB(bytes), { document } = container;
  validateLocalGLBExtensions(document);
  validateLocalGLBMaterials(container);
  const { scene } = validateLocalGLBGeometry(container);
  validateStaticLocalGLBScene(document);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const accessors = new Map<number, number[][]>();
  function values(id: number) {
    if (!accessors.has(id)) {
      const data: number[][] = [];
      visitValidatedLocalGLBAccessor(container, id, v => data.push([...v]));
      accessors.set(id, data);
    }
    return accessors.get(id)!;
  }
  function visit(id: number, parent: number[]) {
    const node = document.nodes[id], matrix = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = document.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        const positions = values(primitive.attributes.POSITION);
        const weights = node.weights ?? mesh.weights ?? [];
        const targets = (primitive.targets ?? []).map((target: Record<string, number>) =>
          target.POSITION === undefined ? null : values(target.POSITION));
        for (let index = 0; index < positions.length; index++) {
          const p = positions[index].slice();
          targets.forEach((target: number[][] | null, t: number) => {
            if (target) for (let axis = 0; axis < 3; axis++) p[axis] += target[index][axis] * (weights[t] ?? 0);
          });
          for (let axis = 0; axis < 3; axis++) {
            const v = matrix[axis]*p[0] + matrix[axis+4]*p[1] + matrix[axis+8]*p[2] + matrix[axis+12];
            if (!Number.isFinite(v) || Math.abs(v) > 1_000_000) throw new Error('Runtime asset has invalid transformed bounds.');
            min[axis] = Math.min(min[axis], v); max[axis] = Math.max(max[axis], v);
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, matrix);
  }
  for (const root of document.scenes[scene.activeScene].nodes ?? []) visit(root, identity());
  const size = max.map((v, i) => v - min[i]);
  if (size.some(v => !Number.isFinite(v) || v <= 0)) throw new Error('Runtime asset must have positive dimensions on all axes.');
  return {
    translation: min.map((v, i) => -(v + max[i]) / 2 / size[i]) as RuntimeVec3,
    scale: size.map(v => 1 / v) as RuntimeVec3,
  };
}
