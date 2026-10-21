/** Product defaults, not image measurements. Explicit user edits remain authoritative. */
export const PLAN2WORLD_DEFAULT_WALL_HEIGHT_CM = 280;
export function initialOpeningHeight(wall?: { id: string; height?: number }): number {
  return wall?.height ?? PLAN2WORLD_DEFAULT_WALL_HEIGHT_CM;
}
