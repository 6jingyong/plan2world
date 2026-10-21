import type { DraftPoint } from './draft';

export interface RasterSamplingBounds { minX: number; minY: number; maxX: number; maxY: number }
export interface RasterBackgroundEstimate {
  method: 'interior-grid-v1';
  scope: 'architecture-bounds' | 'image-interior';
  bounds: RasterSamplingBounds;
  sampleCount: number;
  medianLightness: number;
  supportFraction: number;
  status: 'resolved' | 'ambiguous';
}

/** Only guides background sampling. Never clips pixels or changes geometry. */
export function rasterSamplingBounds(points: DraftPoint[]): RasterSamplingBounds | undefined {
  if (!points.length) return;
  return { minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)),
    maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)) };
}

export function estimateRasterBackground(width: number, height: number, lightness: (x: number, y: number) => number,
  focus?: RasterSamplingBounds) {
  const usable = focus && Object.values(focus).every(Number.isFinite)
    && focus.minX >= 0 && focus.minY >= 0 && focus.maxX <= width && focus.maxY <= height
    && focus.maxX - focus.minX >= 8 && focus.maxY - focus.minY >= 8;
  const bounds = usable ? { ...focus } : { minX: 0, minY: 0, maxX: width, maxY: height };
  // Stratified interior samples tolerate a photo frame of either colour. Small
  // deterministic offsets avoid locking a regular grid onto repeated strokes.
  const values: number[] = [];
  for (let row = 0; row < 41; row++) for (let col = 0; col < 43; col++) {
    const jitter = ((row * 17 + col * 31) % 97) / 97;
    const u = 0.02 + 0.96 * (col + 0.25 + jitter * 0.5) / 43;
    const v = 0.02 + 0.96 * (row + 0.75 - jitter * 0.5) / 41;
    const x = Math.min(width - 1, Math.floor(bounds.minX + u * (bounds.maxX - bounds.minX)));
    const y = Math.min(height - 1, Math.floor(bounds.minY + v * (bounds.maxY - bounds.minY)));
    values.push(lightness(x, y));
  }
  values.sort((a, b) => a - b);
  const quantile = (fraction: number) => values[Math.floor((values.length - 1) * fraction)];
  const medianLightness = quantile(0.5), dark = medianLightness < 128;
  const supportFraction = values.filter(value => dark ? value <= 96 : value >= 160).length / values.length;
  const estimate: RasterBackgroundEstimate = { method: 'interior-grid-v1',
    scope: usable ? 'architecture-bounds' : 'image-interior', bounds, sampleCount: values.length,
    medianLightness, supportFraction, status: supportFraction >= 0.7 ? 'resolved' : 'ambiguous' };
  return { estimate, polarity: dark ? 'light-on-dark' : 'dark-on-light',
    background: quantile(dark ? 0.1 : 0.9) };
}

export function validRasterBackgroundEstimate(value: RasterBackgroundEstimate, width: number, height: number) {
  return value?.method === 'interior-grid-v1'
    && ['architecture-bounds', 'image-interior'].includes(value.scope)
    && value.bounds && Object.values(value.bounds).length === 4 && Object.values(value.bounds).every(Number.isFinite)
    && value.bounds.minX >= 0 && value.bounds.minY >= 0 && value.bounds.maxX <= width && value.bounds.maxY <= height
    && value.bounds.maxX > value.bounds.minX && value.bounds.maxY > value.bounds.minY
    && value.sampleCount === 41 * 43 && Number.isFinite(value.medianLightness)
    && value.medianLightness >= 0 && value.medianLightness <= 255
    && Number.isFinite(value.supportFraction) && value.supportFraction >= 0 && value.supportFraction <= 1
    && value.status === (value.supportFraction >= 0.7 ? 'resolved' : 'ambiguous');
}
