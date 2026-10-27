import { appendBox, addQuad, type MeshBuilder } from './presentationGeometry';
import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeColumnEntity,
  RuntimeStairEntity,
  RuntimeVec2,
  RuntimeVec3,
  RuntimeWindowEntity,
} from './types';

const EPSILON = 1e-9;
const WINDOW_DEPTH = 0.025;
const STAIR_BASE_THICKNESS = 0.04;
const CYLINDER_SEGMENTS = 24;

export type StaticArchitectureKind = 'window' | 'column' | 'stair';
export type StaticArchitectureMaterial = 'glass' | 'column' | 'stair' | 'decor-frame';

export interface StaticArchitecturePrimitive {
  id: string;
  kind: StaticArchitectureKind;
  ownerId: string;
  floorId: string;
  material: StaticArchitectureMaterial;
  positions: RuntimeVec3[];
  normals: RuntimeVec3[];
  uvs: RuntimeVec2[];
  indices: number[];
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > EPSILON;
}

function boxPrimitive(
  id: string,
  kind: StaticArchitectureKind,
  ownerId: string,
  floorId: string,
  center: RuntimeVec3,
  size: RuntimeVec3,
  yaw: number,
  material: StaticArchitectureMaterial,
): StaticArchitecturePrimitive {
  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  appendBox(builder, center, size, yaw);
  return { id, kind, ownerId, floorId, material, ...builder };
}

function compileWindow(entity: RuntimeWindowEntity): StaticArchitecturePrimitive | null {
  if (!finitePositive(entity.width) || !finitePositive(entity.height) || !entity.center.every(Number.isFinite)) return null;
  return boxPrimitive(
    `architecture:window:${entity.id}`, 'window', entity.id, entity.floorId,
    entity.center, [entity.width, entity.height, WINDOW_DEPTH], entity.yawClockwiseRadians, 'glass',
  );
}

function compileWindowFrame(entity: RuntimeWindowEntity): StaticArchitecturePrimitive | null {
  if(entity.windowType==='standard' || !finitePositive(entity.width) || !finitePositive(entity.height))return null;
  const builder:MeshBuilder={positions:[],normals:[],uvs:[],indices:[]},w=entity.width,h=entity.height,t=Math.min(.035,w/12,h/12),yaw=entity.yawClockwiseRadians;
  const box=(x:number,y:number,width:number,height:number,depth=.05)=>appendBox(builder,[entity.center[0]+Math.cos(yaw)*x,entity.center[1]+y,entity.center[2]+Math.sin(yaw)*x],[width,height,depth],yaw);
  box(-w/2+t/2,0,t,h);box(w/2-t/2,0,t,h);box(0,-h/2+t/2,w,t);box(0,h/2-t/2,w,t);
  if(entity.windowType==='casement' || entity.windowType==='sliding')box(0,0,t,h);
  if(entity.windowType==='sliding')box(0,-h/2+t*2,w,t,.07);
  if(entity.windowType==='bay'){box(-w/4,0,t,h);box(w/4,0,t,h);}
  return {id:`architecture:window-frame:${entity.id}`,kind:'window',ownerId:entity.id,floorId:entity.floorId,material:'decor-frame',...builder};
}

function compileSquareColumn(entity: RuntimeColumnEntity): StaticArchitecturePrimitive | null {
  if (!finitePositive(entity.diameter) || !finitePositive(entity.height) || !entity.position.every(Number.isFinite)) return null;
  return boxPrimitive(
    `architecture:column:${entity.id}`, 'column', entity.id, entity.floorId,
    entity.position, [entity.diameter, entity.height, entity.diameter], entity.yawClockwiseRadians, 'column',
  );
}

function compileRoundColumn(entity: RuntimeColumnEntity): StaticArchitecturePrimitive | null {
  if (!finitePositive(entity.diameter) || !finitePositive(entity.height) || !entity.position.every(Number.isFinite)) return null;
  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const radius = entity.diameter / 2;
  const bottom = entity.position[1] - entity.height / 2;
  const top = entity.position[1] + entity.height / 2;
  for (let index = 0; index < CYLINDER_SEGMENTS; index += 1) {
    const a0 = index / CYLINDER_SEGMENTS * Math.PI * 2;
    const a1 = (index + 1) / CYLINDER_SEGMENTS * Math.PI * 2;
    const p0: RuntimeVec3 = [entity.position[0] + Math.cos(a0) * radius, bottom, entity.position[2] + Math.sin(a0) * radius];
    const p1: RuntimeVec3 = [entity.position[0] + Math.cos(a1) * radius, bottom, entity.position[2] + Math.sin(a1) * radius];
    const p2: RuntimeVec3 = [p1[0], top, p1[2]];
    const p3: RuntimeVec3 = [p0[0], top, p0[2]];
    addQuad(builder, [p1, p0, p3, p2], [[(index + 1) / CYLINDER_SEGMENTS, 0], [index / CYLINDER_SEGMENTS, 0], [index / CYLINDER_SEGMENTS, entity.height], [(index + 1) / CYLINDER_SEGMENTS, entity.height]]);

    const topBase = builder.positions.length;
    builder.positions.push([entity.position[0], top, entity.position[2]], p2, p3);
    builder.normals.push([0, 1, 0], [0, 1, 0], [0, 1, 0]);
    builder.uvs.push([0.5, 0.5], [1, 0], [0, 0]);
    builder.indices.push(topBase, topBase + 1, topBase + 2);

    const bottomBase = builder.positions.length;
    builder.positions.push([entity.position[0], bottom, entity.position[2]], p0, p1);
    builder.normals.push([0, -1, 0], [0, -1, 0], [0, -1, 0]);
    builder.uvs.push([0.5, 0.5], [0, 0], [1, 0]);
    builder.indices.push(bottomBase, bottomBase + 1, bottomBase + 2);
  }
  return {
    id: `architecture:column:${entity.id}`, kind: 'column', ownerId: entity.id, floorId: entity.floorId,
    material: 'column', ...builder,
  };
}

function compileColumn(entity: RuntimeColumnEntity): StaticArchitecturePrimitive | null {
  return entity.shape === 'round' ? compileRoundColumn(entity) : compileSquareColumn(entity);
}

function compileStraightStair(entity: RuntimeStairEntity): StaticArchitecturePrimitive | null {
  if (entity.traversal.kind !== 'ramp' || entity.stairType !== 'straight') return null;
  if (!finitePositive(entity.width) || !finitePositive(entity.depth) || !Number.isInteger(entity.riserCount) || entity.riserCount < 1) return null;
  const startY = entity.traversal.startElevation;
  const endY = entity.traversal.endElevation;
  if (!Number.isFinite(startY) || !Number.isFinite(endY) || Math.abs(endY - startY) <= EPSILON) return null;

  const builder: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  const yaw = entity.yawClockwiseRadians;
  const depthAxis: RuntimeVec2 = [-Math.sin(yaw), Math.cos(yaw)];
  const travelSign = entity.direction === 'up' ? -1 : 1;
  const travel: RuntimeVec2 = [depthAxis[0] * travelSign, depthAxis[1] * travelSign];
  const renderYaw = travelSign < 0 ? yaw + Math.PI : yaw;
  const start: RuntimeVec2 = [
    entity.position[0] - travel[0] * entity.depth / 2,
    entity.position[2] - travel[1] * entity.depth / 2,
  ];
  const low = Math.min(startY, endY) - STAIR_BASE_THICKNESS;
  const delta = endY - startY;
  const stepDepth = entity.depth / entity.riserCount;

  for (let index = 0; index < entity.riserCount; index += 1) {
    const topProgress = delta > 0 ? (index + 1) / entity.riserCount : index / entity.riserCount;
    const top = startY + delta * topProgress;
    const height = Math.max(STAIR_BASE_THICKNESS, top - low);
    const distance = (index + 0.5) * stepDepth;
    const center: RuntimeVec3 = [
      start[0] + travel[0] * distance,
      low + height / 2,
      start[1] + travel[1] * distance,
    ];
    appendBox(builder, center, [entity.width, height, stepDepth], renderYaw);
  }

  return {
    id: `architecture:stair:${entity.id}`, kind: 'stair', ownerId: entity.id, floorId: entity.floorId,
    material: 'stair', ...builder,
  };
}

/** Static runtime entities that belong in shared presentation geometry rather
 * than engine-specific compatibility proxies. Dynamic doors and replaceable
 * furniture stay outside architecture.glb.
 */
export function compileStaticArchitectureEntities(scene: Plan2WorldRuntimeSceneV1): StaticArchitecturePrimitive[] {
  const primitives: StaticArchitecturePrimitive[] = [];
  for (const entity of scene.entities) {
    let primitive: StaticArchitecturePrimitive | null = null;
    if (entity.kind === 'window') primitive = compileWindow(entity);
    else if (entity.kind === 'column') primitive = compileColumn(entity);
    else if (entity.kind === 'stair') primitive = compileStraightStair(entity);
    if (primitive) primitives.push(primitive);
    if (entity.kind==='window' && primitive) {const frame=compileWindowFrame(entity);if(frame)primitives.push(frame);}
  }
  return primitives;
}
