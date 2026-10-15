import { describe, expect, it } from 'vitest';
import type { Wall } from '$lib/models/types';
import { readProject } from '$lib/utils/projectValidation';
import {
  draftToProjectWithSourceBackground,
  sourceBackgroundForWalls,
} from '$lib/plan2world/sourceBackground';

const walls: Wall[] = [
  { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, height: 280, color: '#eee' },
  { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 20, height: 280, color: '#eee' },
  { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 20, height: 280, color: '#eee' },
  { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 20, height: 280, color: '#eee' },
];

const source = {
  dataUrl: 'data:image/png;base64,AA==',
  width: 1000,
  height: 500,
};

const draft = {
  schemaVersion: 'plan2world-draft-v1',
  name: 'Underlay apartment',
  units: 'cm',
  scale: { mode: 'measured', confidence: 0.95, basis: '400 cm printed dimension' },
  assumptions: [],
  floors: [{
    id: 'floor-0',
    name: 'Ground Floor',
    level: 0,
    walls: walls.map(({ id, start, end }) => ({ id, start, end, kind: 'exterior' })),
    doors: [],
    windows: [],
    furniture: [],
  }],
};

describe('Plan2World source floor-plan background', () => {
  it('fits the source image around wall bounds without stretching it', () => {
    const background = sourceBackgroundForWalls(walls, source);
    expect(background).toBeDefined();
    expect(background?.position).toEqual({ x: 200, y: 150 });
    expect(background?.scale).toBeCloseTo(0.6);
    expect(source.width * background!.scale).toBeCloseTo(600);
    expect(source.height * background!.scale).toBeCloseTo(300);
    expect(background?.opacity).toBe(0.35);
    expect(background?.rotation).toBe(0);
    expect(background?.locked).toBe(true);
  });

  it('attaches the underlay to the native project without changing reconstructed geometry', () => {
    const now = new Date('2026-10-15T00:00:00Z');
    const project = draftToProjectWithSourceBackground(draft, source, now);
    const validated = readProject(project);

    expect(validated.floors[0].walls[0].end).toEqual({ x: 400, y: 0 });
    expect(validated.floors[0].backgroundImage?.dataUrl).toBe(source.dataUrl);
    expect(validated.floors[0].backgroundImage?.position).toEqual({ x: 200, y: 150 });
    expect(validated.floors[0].backgroundImage?.locked).toBe(true);
  });

  it('rejects invalid source dimensions instead of creating a broken background', () => {
    expect(() => sourceBackgroundForWalls(walls, { ...source, width: 0 })).toThrow(/width/i);
  });
});
