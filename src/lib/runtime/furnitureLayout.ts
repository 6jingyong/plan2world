import type { Project, FurnitureItem, FurnitureWallMount, FurnitureCeilingMount, FurnitureLightSettings } from '../models/types';
import { readProject } from '../utils/projectValidation';
import { furnitureCatalog, getCatalogItem } from '../utils/furnitureCatalog';
import { furnitureSvg } from '../utils/furnitureSvg';

import { needsWallMount, placeOnWall } from '../utils/furniturePlacement';
import { needsCeilingMount, furnitureCeilingFrame, ceilingLightProfile } from '../utils/ceilingFurniture';

type Asset = { catalogId: string; customModelId?: string };
export type FurnitureLayoutCommand =
  | { type: 'add'; floorId: string; position: { x: number; y: number }; asset: Asset; wallMount?: FurnitureWallMount; ceilingMount?: FurnitureCeilingMount }
  | { type: 'move'; floorId: string; id: string; position: { x: number; y: number }; elevation?: number; rotation?: number }
  | { type: 'rotate'; floorId: string; id: string; rotation: number }
  | { type: 'replace'; floorId: string; id: string; asset: Asset; wallMount?: FurnitureWallMount; ceilingMount?: FurnitureCeilingMount }
  | { type: 'light'; floorId: string; id: string; light: FurnitureLightSettings }
  | { type: 'remove'; floorId: string; id: string };

/** Engine-neutral native furniture edits. Architecture and input stay untouched.
 * Positions are native centimetres; rotation is native clockwise degrees. */
export function applyFurnitureLayoutCommand(input: unknown, command: FurnitureLayoutCommand, now = new Date()) {
  const project = readProject(input);
  const floor = project.floors.find(f => f.id === command.floorId);
  if (!floor) throw new Error('Furniture edit requires an existing floor.');
  const assetFields = (asset: Asset): Partial<FurnitureItem> => {
    if (asset.customModelId !== undefined) {
      const model = project.customModels?.find(m => m.id === asset.customModelId);
      if (!model || asset.catalogId !== 'custom-model') throw new Error('Choose an existing custom model.');
      return { catalogId: 'custom-model', customModelId: model.id, width: model.width, depth: model.depth, height: model.height };
    }
    const catalog = getCatalogItem(asset.catalogId);
    if (!catalog || catalog.symbol) throw new Error('Choose a supported furniture catalog item.');
    return { catalogId: catalog.id };
  };
  const position = (p: { x: number; y: number }) => {
    if (!p || ![p.x, p.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1_000_000)) throw new Error('Furniture position must be finite native centimetres.');
    return { x: p.x, y: p.y };
  };
  const attach = (item: FurnitureItem, mount?: FurnitureWallMount, ceiling?: FurnitureCeilingMount) => {
    if (mount) item.wallMount = { ...mount };
    if (ceiling) item.ceilingMount = { wallIds: [...ceiling.wallIds] };
    if (needsCeilingMount(item.catalogId)) {
      furnitureCeilingFrame(floor,item);
      item.light ??= { ...ceilingLightProfile(item.catalogId)!.defaults };
      return;
    }
    if (item.ceilingMount) throw new Error('Choose ceiling-mounted furniture for this ceiling binding.');
    if (needsWallMount(item.catalogId) && !item.wallMount) throw new Error('Choose an authored wall and installation height for this item.');
    if (item.wallMount) {
      const placed = placeOnWall(floor, item, item.position, item.wallMount.elevation);
      item.position = placed.position; item.rotation = placed.rotation; item.wallMount.elevation = placed.elevation;
    }
  };
  const rotate = (item: FurnitureItem, rotation: number) => {
    if (item.wallMount || needsWallMount(item.catalogId)) throw new Error('Wall furniture orientation follows its authored wall.');
    if (typeof rotation !== 'number' || !Number.isFinite(rotation)) throw new Error('Furniture rotation must be finite native degrees.');
    item.rotation = rotation;
    if (item.ceilingMount) furnitureCeilingFrame(floor,item);
  };
  let selectedId: string | null = null;
  if (command.type === 'add') {
    const ids = new Set(project.floors.flatMap(f => [f.id, ...Object.values(f).flatMap(value => Array.isArray(value) ? value.flatMap(item => item && typeof item.id === 'string' ? [item.id] : []) : [])]));
    let index = 1;
    while (ids.has(`layout-furniture-${index}`)) index++;
    const item = { id: `layout-furniture-${index}`, position: position(command.position), rotation: 0, scale: { x: 1, y: 1, z: 1 }, ...assetFields(command.asset) } as FurnitureItem;
    attach(item, command.wallMount, command.ceilingMount);
    floor.furniture.push(item);
    selectedId = item.id;
  } else {
    const item = floor.furniture.find(i => i.id === command.id);
    if (!item) throw new Error('This furniture no longer exists on this floor.');
    if (item.locked) throw new Error('This furniture is locked.');
    selectedId = item.id;
    switch (command.type) {
      case 'move':
        item.position = position(command.position);
        if (command.rotation !== undefined) rotate(item, command.rotation);
        if (item.wallMount) { item.wallMount.elevation = command.elevation ?? item.wallMount.elevation; attach(item); }
        else if (command.elevation !== undefined) throw new Error('Floor furniture cannot change elevation.');
        else if (item.ceilingMount) attach(item);
        break;
      case 'rotate':
        rotate(item, command.rotation); break;
      case 'replace': {
        const fields = assetFields(command.asset);
        for (const key of ['customModelId', 'width', 'depth', 'height', 'renderStyle'] as const) delete item[key];
        item.scale = { x: 1, y: 1, z: 1 };
        Object.assign(item, fields);
        if (needsCeilingMount(item.catalogId)) delete item.wallMount;
        else { delete item.ceilingMount; delete item.light; }
        attach(item, command.wallMount, command.ceilingMount);
        break;
      }
      case 'light':
        if (!item.ceilingMount || !ceilingLightProfile(item.catalogId)) throw new Error('Select an attached ceiling light.');
        item.light = { ...command.light }; attach(item); break;
      case 'remove':
        floor.furniture = floor.furniture.filter(i => i.id !== item.id);
        floor.groups = floor.groups.map(group => ({ ...group, elementIds: group.elementIds.filter(id => id !== item.id) })).filter(group => group.elementIds.length >= 2);
        selectedId = null;
        break;
      default: throw new Error('Unsupported furniture edit command.');
    }
  }
  project.updatedAt = now;
  return { project: readProject(project), selectedId };
}

/** Read-only editor catalog projection, separate from runtime scene artifacts.
 * Reuse native authoring symbols; these are 2D inventory illustrations, not model
 * bounds, presentation assets or collision. All dimensions remain native cm. */
export function furnitureLayoutCatalog(project: Project) {
  const illustration = (id: string, width: number, depth: number, color: string) => {
    const scale = 58 / Math.max(width, depth, 1);
    // SVG 1.1 alpha attributes work consistently in native SVG rasterizers.
    const symbol = furnitureSvg(id, width * scale, depth * scale, color).replace(
      /(fill|stroke)="#([0-9a-f]{6})([0-9a-f]{2})"/gi,
      (_, paint: string, rgb: string, alpha: string) => `${paint}="#${rgb}" ${paint}-opacity="${parseInt(alpha, 16) / 255}"`,
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="-36 -36 72 72">${symbol}</svg>`;
  };
  return [
    ...furnitureCatalog.filter(item => !item.symbol).map(item => ({
      label: item.name, category: item.category, dimensions: [item.width, item.depth, item.height],
      symbolSvg: illustration(item.id, item.width, item.depth, item.color),
      mounting: needsCeilingMount(item.id) ? 'ceiling' : needsWallMount(item.id) ? 'wall' : 'floor', asset: { catalogId: item.id } as Asset,
    })),
    ...(project.customModels ?? []).map(model => ({
      label: model.name, category: 'Custom models', dimensions: [model.width, model.depth, model.height],
      mounting: 'floor' as const,
      symbolSvg: illustration('imported_object', model.width, model.depth, '#63756c'),
      asset: { catalogId: 'custom-model', customModelId: model.id } as Asset,
    })),
  ];
}
