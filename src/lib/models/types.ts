export interface Point { x: number; y: number; }

/** Shared item metadata. Null explicitly clears a retained native value. */
export interface ItemDetails {
  note?: string | null;
  price?: number | null;
  photos?: string[];
  material?: string | null;
  roomType?: string | null;
  ceilingHeight?: number | null; // centimetres; metadata, not a wall-height edit
}
export type DetailKind = 'walls' | 'doors' | 'windows' | 'furniture' | 'rooms';
export type DetailTarget = { floorId: string; kind: DetailKind; id: string };
export type PackageMapping = { id: string; kind: string; webId: string; floorId?: string }[];
export interface ProjectPackageState {
  version: 1;
  furnitureCategoriesVersion?: 1;
  native: Record<string, any>;
  mapping: PackageMapping;
  assets: Record<string, string>; // assets/<filename> → base64 bytes, one copy per file
}

export interface Wall {
  /** Explicit human correction; retained across saves, never image evidence. */
  authorModified?: boolean;
  /** Logical air boundaries are invisible but retain native collision/closure. */
  boundaryType?: 'solid' | 'railing' | 'air';
  details?: ItemDetails;
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
  /** Endpoint heights in centimetres. Missing values use the legacy height. */
  startHeight?: number;
  endHeight?: number;
  color: string;
  /** Optional quadratic bezier control point for curved walls */
  curvePoint?: Point;
  texture?: string;
  /** Interior-specific overrides (if different from exterior) */
  interiorColor?: string;
  interiorTexture?: string;
  /** Exterior-specific overrides */
  exteriorColor?: string;
  exteriorTexture?: string;
}

export function validWallHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function getWallStartHeight(wall: Partial<Pick<Wall, 'startHeight' | 'height'>>): number {
  return validWallHeight(wall.startHeight) ? wall.startHeight : validWallHeight(wall.height) ? wall.height : 280;
}

export function getWallEndHeight(wall: Partial<Pick<Wall, 'endHeight' | 'height'>>): number {
  return validWallHeight(wall.endHeight) ? wall.endHeight : validWallHeight(wall.height) ? wall.height : 280;
}

export function getWallHeightAt(wall: Wall, t: number): number {
  const s = getWallStartHeight(wall);
  const e = getWallEndHeight(wall);
  const clampedT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return s + (e - s) * clampedT;
}


export type RoomCategory = 'indoor' | 'outdoor' | 'garage' | 'utility';

/** Ordered floor perimeter: free source points or a live native wall path.
 * A free point's control describes the edge to the next part's first point.
 * Straight connectors and the final closing edge are implicit, never walls.
 */
export type FloorBoundaryPart = { point: Point; curvePoint?: Point } | { wallId: string; reverse?: boolean };

export interface Room {
  /** Explicit ground surface for an open area. Omitted for wall-derived rooms. */
  boundary?: FloorBoundaryPart[];
  /** Enclosed opening through this floor's slab; excluded from usable floor area. */
  floorOpening?: boolean;
  details?: ItemDetails;
  id: string;
  name: string;
  walls: string[];
  floorTexture: string;
  area: number;
  color?: string;
  roomType?: RoomCategory;
  /** Custom label position offset from centroid (in world units) */
  labelOffset?: Point;
}

/** Author input in native cm, in the opening chord frame (A to B, normal left).
 * A fixed panel retains a real collider; it is never an inferred moving leaf. */
export interface SlidingDoorLeaf {
  id: string;
  width: number;
  center: number;
  track: number;
  motion: 'fixed' | 'slide';
  travel: number; // signed cm along the opening chord; fixed panels require 0
}
export type DoorLeafConfiguration =
  | { kind: 'paired'; firstLeafRatio: number }
  | { kind: 'sliding'; leaves: SlidingDoorLeaf[] };

export interface Door {
  /** Appearance only; does not change aperture, leaves, motion or collision. */
  material?: 'wood' | 'glass' | 'steel';
  details?: ItemDetails;
  id: string;
  wallId: string;
  position: number; // 0-1 along wall
  width: number;
  height: number;
  type: 'single' | 'double' | 'sliding' | 'french' | 'pocket' | 'bifold' | 'opening' | 'garage';
  swingDirection: 'left' | 'right';
  flipSide: boolean; // flip which side of wall the door opens to (vertical flip)
  leafConfiguration?: DoorLeafConfiguration;
}

export interface Window {
  details?: ItemDetails;
  id: string;
  wallId: string;
  position: number; // 0-1 along wall
  width: number;
  height: number;
  sillHeight: number;
  type: 'standard' | 'fixed' | 'casement' | 'sliding' | 'bay';
}

export interface FurnitureWallMount { wallId: string; side: 'left' | 'right'; elevation: number }
/** Explicit native wall-boundary identity of one supported horizontal ceiling. */
export interface FurnitureCeilingMount { wallIds: string[] }
export interface FurnitureLightSettings { enabled: boolean; lumens: number; temperatureKelvin: number }

export interface FurnitureItem {
  /** Explicit host constraint; elevation is bottom above the authored floor, cm. */
  wallMount?: FurnitureWallMount;
  ceilingMount?: FurnitureCeilingMount;
  light?: FurnitureLightSettings;
  /** Project-owned model; catalogId remains a portable procedural fallback. */
  customModelId?: string;
  details?: ItemDetails;
  id: string;
  catalogId: string;
  /** Source semantics retained when the user replaces its placeholder style. */
  sourceCategory?: string;
  /** Explicit semantic block or local procedural style; legacy previews omit it. */
  renderStyle?: 'block' | 'model';
  position: Point;
  rotation: number;
  scale: { x: number; y: number; z: number };
  // Per-item overrides (optional — falls back to catalog defaults)
  color?: string;
  width?: number;   // cm
  depth?: number;   // cm
  height?: number;  // cm
  material?: string; // material name/id
  locked?: boolean;
}

export interface ElementGroup {
  id: string;
  elementIds: string[];
}

export type StairType = 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';

export interface Stair {
  id: string;
  position: Point;
  rotation: number;
  width: number;   // default 100cm
  depth: number;   // default 300cm
  riserCount: number; // default 14
  direction: 'up' | 'down';
  stairType: StairType; // default 'straight'
}

export interface Column {
  id: string;
  position: Point;
  rotation: number;
  shape: 'round' | 'square';
  diameter: number;  // cm (for round) or side length (for square)
  height: number;    // cm
  color: string;
}

export interface Measurement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Annotation {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  offset: number; // perpendicular offset for dimension line (default 40)
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation: number;
}

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // world coordinate (x for vertical, y for horizontal)
}

export interface BackgroundImage {
  dataUrl: string;
  position: Point;
  scale: number;
  opacity: number;
  rotation: number;
  locked: boolean;
  /** Dimensions and provenance of this reconstruction raster; replacement images omit this marker. */
  reconstructionSource?: {
    width: number;
    height: number;
    name?: string;
    registration: 'anchors' | 'bounds';
    confidence?: number;
  };
}

/** A placed 2D entourage symbol (person, car, tree, …) for presentation plans */
export interface EntourageItem {
  id: string;
  defId: string; // id of a built-in EntourageDef or a project CustomEntourageDef
  position: Point; // center, world cm
  width: number; // real-world width in cm
  rotation: number; // degrees
  opacity?: number; // 0–1, default 1
  locked?: boolean;
}

/** User-uploaded PNG entourage symbol, stored on the project */
export interface CustomEntourageDef {
  id: string;
  name: string;
  dataUrl: string; // PNG as data URL
  aspect: number; // height / width
}

export interface FunctionalZoneLabel {
  id: string; label: string; category: string; environment: 'indoor' | 'balcony' | 'outdoor'; position: Point;
}

export interface Floor {
  /** Source semantics attached by a seed; native walls still own all geometry. */
  functionalZones?: FunctionalZoneLabel[];
  id: string;
  name: string;
  level: number;
  /** Floor surface above ground in cm; omitted in legacy projects (level × 300). */
  elevation?: number;
  /** Room slab depth below the floor surface in cm; defaults to 5. */
  slabThickness?: number;
  /** Preferred first-person entry point in plan coordinates. Missing means automatic placement. */
  walkthroughStart?: Point;
  /** Author-selected main door and inward side relative to its directed host wall. */
  entrance?: { doorId: string; side: 'left' | 'right' };
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  furniture: FurnitureItem[];
  stairs: Stair[];
  columns: Column[];
  backgroundImage?: BackgroundImage;
  guides: GuideLine[];
  measurements: Measurement[];
  annotations: Annotation[];
  textAnnotations: TextAnnotation[];
  groups: ElementGroup[];
  entourage?: EntourageItem[];
}

export interface CustomModelDef {
  id: string;
  name: string;
  assetName: string; // filename within projectPackage.assets, without assets/
  sourceFilename: string;
  sha256: string; // digest of original GLB bytes, checked again before loading
  byteLength: number;
  width: number; // cm
  depth: number; // cm
  height: number; // cm
  attribution?: string;
  license?: string;
  sourceUrl?: string;
}

/** Historical source-boundary checks, not live geometry or a second scene. */
export interface ReconstructionObservationReview {
  version: 1;
  acceptedZoneCount: number;
  supportedZoneCount: number;
  zoneFindings: { label: string; message: string }[];
}

/** Import evidence only. Current geometry findings are read from live Floors. */
export interface ReconstructionEvidence {
  version: 1;
  observationReview?: ReconstructionObservationReview;
  inputPreparation?: import('../plan2world/imagePreparation').ImagePreparationEvidence;
  scale: { mode: 'measured' | 'provided' | 'estimated'; confidence: number; basis?: string };
  assumptions: string[];
  floors: {
    floorId: string;
    walls: { id: string; confidence?: number; kind?: 'interior' | 'exterior' | 'unknown' }[];
    doors: { id: string; confidence?: number }[];
    windows: { id: string; confidence?: number }[];
    floorAreas?: { id: string; confidence?: number }[];
  }[];
}

export interface Project {
  /** Authoring review notes. Source records remain evidence, never live geometry. */
  architectureReview?: { version: 1; sourceObservations?: string; workingImageSha256?: string; issues: { id: string; floorId: string; message: string; position?: Point; sourceRecord?: string; resolved: boolean }[] };
  reconstruction?: ReconstructionEvidence;
  customModels?: CustomModelDef[];
  attachmentNames?: Record<string, string>;
  projectPackage?: ProjectPackageState;
  id: string;
  name: string;
  description?: string;
  floors: Floor[];
  activeFloorId: string;
  createdAt: Date;
  updatedAt: Date;
  customEntourage?: CustomEntourageDef[];
}
