import type { FurnitureItem } from '$lib/models/types';
import { getCatalogItem } from './furnitureCatalog';

/** Existing local procedural models; no asset service or second placement model. */
export const furnitureStyleIds = [
  'sofa', 'loveseat', 'chair', 'coffee_table', 'tv_stand', 'bookshelf',
  'bed_queen', 'bed_twin', 'nightstand', 'dresser', 'wardrobe',
  'desk', 'office_chair', 'dining_table', 'dining_chair',
  'stove', 'fridge', 'sink_k', 'counter', 'toilet', 'bathtub', 'shower', 'sink_b', 'washer_dryer',
] as const;

/** Snapshot unscaled dimensions before changing catalog defaults. */
export function furnitureStylePatch(item: FurnitureItem, catalogId: string): Partial<FurnitureItem> | null {
  if (item.customModelId || !item.sourceCategory ||
      (catalogId !== 'imported_object' && !furnitureStyleIds.some(id => id === catalogId))) return null;
  const previous = getCatalogItem(item.catalogId);
  return {
    catalogId, renderStyle: catalogId === 'imported_object' ? undefined : 'model',
    width: item.width ?? previous?.width ?? 50,
    depth: item.depth ?? previous?.depth ?? 50,
    height: item.height ?? previous?.height ?? 50,
  };
}
