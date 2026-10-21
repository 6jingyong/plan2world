import type { DraftPoint } from './draft';

/** Inspectable coordinates only. One divisor retains the source aspect ratio;
 * this neither fits lines nor changes the native centimetre conversion. */
export function sourceRelativeGeometry(
  walls: readonly { id?: string; start: DraftPoint; end: DraftPoint; curvePoint?: DraftPoint }[],
  width: number, height: number,
) {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Relative geometry requires positive source dimensions.');
  const divisorPx = Math.max(width, height);
  const relative = (p: DraftPoint) => ({ x: p.x / divisorPx, y: p.y / divisorPx });
  return { policy: 'isotropic-source-relative-v1', divisorPx, width: width / divisorPx, height: height / divisorPx,
    walls: walls.map(w => ({ ...(w.id ? { id: w.id } : {}), start: relative(w.start), end: relative(w.end),
      ...(w.curvePoint ? { curvePoint: relative(w.curvePoint) } : {}) })),
    scalePolicy: 'One real planar length establishes one uniform scale. Wall/opening heights are independent.' };
}
