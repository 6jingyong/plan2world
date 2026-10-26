export type RuntimeVec2 = [number, number];
export type RuntimeVec3 = [number, number, number];

export type RuntimeDoorType = 'single' | 'double' | 'sliding' | 'french' | 'pocket' | 'bifold' | 'opening' | 'garage';
export type RuntimeWindowType = 'standard' | 'fixed' | 'casement' | 'sliding' | 'bay';

export interface RuntimePlayerProfile {
  eyeHeight: number;
  radius: number;
  speeds: { slow: number; walk: number; fast: number };
}

export interface RuntimeRoomSurface {
  id: string;
  name: string;
  roomType: 'indoor' | 'outdoor' | 'garage' | 'utility';
  polygon: RuntimeVec2[];
  holes: RuntimeVec2[][];
  slabThickness: number;
  ceilingHeight: number | null;
  ceilingWallIds?: string[];
}

export interface RuntimeFloor {
  id: string;
  name: string;
  level: number;
  elevation: number;
  walkthroughStart: RuntimeVec3 | null;
  entranceDoorId?: string;
  walkthroughYawClockwiseRadians?: number;
  rooms: RuntimeRoomSurface[];
}

interface RuntimeEntityBase {
  id: string;
  floorId: string;
}

export interface RuntimeWallEntity extends RuntimeEntityBase {
  kind: 'wall';
  path: { start: RuntimeVec2; end: RuntimeVec2; control?: RuntimeVec2 };
  thickness: number;
  startHeight: number;
  endHeight: number;
  boundaryType: 'solid' | 'railing' | 'air';
  visible: boolean;
}

/** One independently moving presentation/physics part, owned by its native door.
 * IDs and closed poses are compiler-owned; assets never specify physical truth. */
export interface RuntimeDoorLeaf {
  id: string;
  colliderId: string;
  assetRef: string;
  size: RuntimeVec3;
  closedPose: { center: RuntimeVec3; yawClockwiseRadians: number };
}

export type RuntimeDoorInteraction =
  | { kind: 'none' }
  | {
      kind: 'swing';
      leaves: (RuntimeDoorLeaf & {
        pivot: RuntimeVec3;
        axis: RuntimeVec3;
        openAngleRadians: number;
      })[];
    }
  | {
      kind: 'slide';
      allowHostOverlap?: boolean;
      leaves: (RuntimeDoorLeaf & { axis: RuntimeVec3; travel: number; fixed?: true })[];
    }
  | {
      kind: 'unsupported';
      sourceMotion: 'fold' | 'overhead';
      leaves: RuntimeDoorLeaf[];
    };

export interface RuntimeDoorEntity extends RuntimeEntityBase {
  kind: 'door';
  hostWallId: string;
  pathPosition: number;
  width: number;
  height: number;
  doorType: RuntimeDoorType;
  swingDirection: 'left' | 'right';
  flipSide: boolean;
  closedPose: { center: RuntimeVec3; yawClockwiseRadians: number };
  interaction: RuntimeDoorInteraction;
}

export interface RuntimeWindowEntity extends RuntimeEntityBase {
  kind: 'window';
  hostWallId: string;
  pathPosition: number;
  width: number;
  height: number;
  sillHeight: number;
  windowType: RuntimeWindowType;
  center: RuntimeVec3;
  yawClockwiseRadians: number;
}

export interface RuntimeFurnitureEntity extends RuntimeEntityBase {
  kind: 'furniture';
  locked: boolean;
  movement: { kind: 'floor'; elevation: number } | { kind: 'ceiling'; roomId: string; elevation: number } | { kind: 'wall'; wallId: string; side: 'left' | 'right'; blocked: { along: RuntimeVec2; bottom: RuntimeVec2 }[]; origin: RuntimeVec3; tangent: RuntimeVec3; along: RuntimeVec2; bottom: RuntimeVec2 } | { kind: 'unbound-wall' };
  light?: { kind: 'omni' | 'spot'; enabled: boolean; lumens: number; temperatureKelvin: number; color: RuntimeVec3; range: number; spotAngleDegrees: number; localPosition: RuntimeVec3; direction: RuntimeVec3 };
  catalogId: string;
  sourceCategory?: string;
  assetRef: string;
  position: RuntimeVec3;
  yawClockwiseRadians: number;
  size: RuntimeVec3;
  /** Plan X/Y mirror signs mapped to world X/Z; height stays upright. */
  mirror?: RuntimeVec3;
}

export interface RuntimeColumnEntity extends RuntimeEntityBase {
  kind: 'column';
  shape: 'round' | 'square';
  position: RuntimeVec3;
  yawClockwiseRadians: number;
  diameter: number;
  height: number;
}

export type RuntimeStairTraversal =
  | {
      kind: 'ramp';
      targetFloorId: string;
      startElevation: number;
      endElevation: number;
    }
  | {
      kind: 'unsupported';
      reason: 'missing-target-floor' | 'invalid-target-elevation' | 'invalid-geometry' | 'non-straight';
    };

export interface RuntimeStairEntity extends RuntimeEntityBase {
  kind: 'stair';
  position: RuntimeVec3;
  yawClockwiseRadians: number;
  width: number;
  depth: number;
  riserCount: number;
  direction: 'up' | 'down';
  stairType: 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';
  traversal: RuntimeStairTraversal;
}

export type RuntimeEntity = RuntimeWallEntity | RuntimeDoorEntity | RuntimeWindowEntity |
  RuntimeFurnitureEntity | RuntimeColumnEntity | RuntimeStairEntity;

interface RuntimeColliderBase {
  id: string;
  ownerId: string;
  floorId: string;
  dynamic: boolean;
}

export interface RuntimeBoxCollider extends RuntimeColliderBase {
  kind: 'box';
  center: RuntimeVec3;
  size: RuntimeVec3;
  yawClockwiseRadians: number;
}

export interface RuntimeCylinderCollider extends RuntimeColliderBase {
  kind: 'cylinder';
  center: RuntimeVec3;
  radius: number;
  height: number;
}

/** Static level geometry represented as indexed triangles in runtime coordinates.
 * Triangle winding is part of the contract so one-sided physics backends do not
 * need to infer which side is walkable.
 */
export interface RuntimeTriangleMeshCollider extends RuntimeColliderBase {
  kind: 'triangle-mesh';
  vertices: RuntimeVec3[];
  indices: number[];
}

export type RuntimeCollider = RuntimeBoxCollider | RuntimeCylinderCollider | RuntimeTriangleMeshCollider;

export interface Plan2WorldRuntimeSceneV1 {
  schema: 'plan2world-runtime-v1';
  version: 1;
  units: 'metres';
  coordinates: {
    handedness: 'right';
    up: '+Y';
    planX: '+X';
    planY: '+Z';
    yaw: 'clockwise-from-+X';
  };
  source: { projectId: string; projectName: string; architectureSha256?: string };
  playerProfile: RuntimePlayerProfile;
  floors: RuntimeFloor[];
  entities: RuntimeEntity[];
  colliders: RuntimeCollider[];
}
