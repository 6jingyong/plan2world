import { expect, it } from 'vitest';
import { buildBareHouse } from '$lib/plan2world/bareHouse';
import { deriveSourceOpenings } from '$lib/plan2world/sourceOpenings';
const p = (x: number, y: number) => ({ x, y });
const trace = { schemaVersion: 'source-wall-trace-v1', walls: [
  { start: p(0, 0), end: p(100, 0) }, { start: p(50, 0), end: p(50, 100) },
] };
const opening = { id: 'win1', kind: 'window', endpoints: [p(20, 0), p(80, 0)], evidence: 'Continuous observed glazing crosses a functional boundary junction.' };

it.each([false, true])('preserves a whole window interval through one split source baseline (reverse=%s)', reverse => {
  const house = buildBareHouse(trace), o = structuredClone(opening); if (reverse) o.endpoints.reverse();
  const before = JSON.stringify({ house, o });
  const result = deriveSourceOpenings({ cmPerPixel: 2, bareHouse: house, openings: [o], allowWindowHostChains: true });
  expect(result.windows).toHaveLength(2);
  expect(result.windows.reduce((s, w) => s + w.width, 0)).toBeCloseTo(120, 9);
  expect(result.sourceIntervals).toHaveLength(1);
  expect(result.sourceIntervals[0]).toMatchObject({ id: 'win1', widthPx: expect.closeTo(60, 9), outputIds: ['win1', 'win1~2'], hostResolution: 'continuous-source-baseline-chain' });
  expect(result.sourceIntervals[0].projectionDistancesPx.every((d: number) => d < 1e-9)).toBe(true);
  expect(JSON.stringify({ house, o })).toBe(before);
});
it('retains the single-host door rule and the explicit legacy window path', () => {
  const house = buildBareHouse(trace);
  const door = deriveSourceOpenings({ cmPerPixel: 1, bareHouse: house, openings: [{ ...opening, id: 'd1', kind: 'door' }], allowWindowHostChains: true });
  expect(door.doors).toEqual([]);
  expect(door.warnings[0].message).toContain('different normalized wall segments');
  expect(deriveSourceOpenings({ cmPerPixel: 1, bareHouse: house, openings: [opening] }).windows).toEqual([]);
});
it('does not bridge a gap in a purported original source baseline', () => {
  const house = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [{ start: p(0, 0), end: p(40, 0) }, { start: p(60, 0), end: p(100, 0) }] });
  house.sourceWallMap = { w1: ['w1', 'w2'] };
  const result = deriveSourceOpenings({ cmPerPixel: 1, bareHouse: house, openings: [opening], allowWindowHostChains: true });
  expect(result.windows).toEqual([]);
});
it('rejects parallel ambiguous host chains instead of selecting one', () => {
  const house: any = { ...buildBareHouse(trace), walls: [
    { id: 'a1', start: p(0, 0), end: p(50, 0) }, { id: 'a2', start: p(50, 0), end: p(100, 0) },
    { id: 'b1', start: p(0, 1), end: p(50, 1) }, { id: 'b2', start: p(50, 1), end: p(100, 1) },
  ], sourceWallMap: { a: ['a1', 'a2'], b: ['b1', 'b2'] } };
  const result = deriveSourceOpenings({ cmPerPixel: 1, bareHouse: house, openings: [{ ...opening, endpoints: [p(20, .5), p(80, .5)] }], allowWindowHostChains: true });
  expect(result.windows).toEqual([]);
  expect(result.warnings[0].message).toContain('ambiguous continuous window host chain');
});
