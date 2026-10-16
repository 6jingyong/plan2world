import { describe, expect, it } from 'vitest';
import blackCandidate from './fixtures/real-floorplans/hard-corpus/black-hidden-doors-gpt56-sol-historical.json';
import blackReference from './fixtures/real-floorplans/hard-corpus/black-hidden-doors-reference.json';
import yjCandidate from './fixtures/real-floorplans/hard-corpus/decorated-yj215-gpt56-sol-historical.json';
import yjReference from './fixtures/real-floorplans/hard-corpus/decorated-yj215-reference.json';
import hydeCandidate from './fixtures/real-floorplans/hard-corpus/one-hyde-park-gpt56-sol-historical.json';
import hydeReference from './fixtures/real-floorplans/hard-corpus/one-hyde-park-reference.json';
import curvedCandidate from './fixtures/real-floorplans/hard-corpus/curved-lianjia-gpt56-sol-historical.json';
import curvedReference from './fixtures/real-floorplans/hard-corpus/curved-lianjia-reference.json';
import { scoreReconstructionAgainstSourceReference } from '$lib/plan2world/sourceReferenceQuality';

const source = { dataUrl: 'data:image/png;base64,AA==', width: 100, height: 100 };

const squareCandidate = {
  schemaVersion: 'plan2world-draft-v1',
  name: 'Perfect square',
  units: 'cm',
  scale: { mode: 'estimated', confidence: 1 },
  sourceRegistration: {
    floorId: 'floor-0',
    confidence: 1,
    anchors: [
      { wallId: 'w1', endpoint: 'start', image: { x: 0, y: 0 } },
      { wallId: 'w1', endpoint: 'end', image: { x: 1, y: 0 } },
      { wallId: 'w2', endpoint: 'end', image: { x: 1, y: 1 } },
      { wallId: 'w3', endpoint: 'end', image: { x: 0, y: 1 } },
    ],
  },
  floors: [{
    id: 'floor-0',
    name: 'Floor',
    level: 0,
    walls: [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'w2', start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { id: 'w3', start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
      { id: 'w4', start: { x: 0, y: 100 }, end: { x: 0, y: 0 } },
    ],
    doors: [{ id: 'door-1', wallId: 'w1', position: 0.5, width: 10 }],
    windows: [],
    furniture: [],
  }],
} as const;

const completeSquareReference = {
  schemaVersion: 'plan2world-source-reference-v1',
  source: { width: 100, height: 100 },
  walls: {
    coverage: 'complete',
    items: [{
      id: 'outer',
      points: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 },
      ],
    }],
  },
  doors: { coverage: 'complete', items: [{ id: 'door-1', point: { x: 0.5, y: 0 } }] },
  windows: { coverage: 'complete', items: [] },
  roomCount: 1,
} as const;

const yjGeometryOnlyCandidate = {
  ...yjCandidate,
  sourceRegistration: {
    floorId: 'floor-0',
    confidence: 1,
    anchors: [
      { wallId: 'w1', endpoint: 'start', image: { x: 248 / 1536, y: 341 / 1026 } },
      { wallId: 'w12', endpoint: 'end', image: { x: 1346 / 1536, y: 799 / 1026 } },
    ],
  },
};

const hydeGeometryOnlyCandidate = {
  ...hydeCandidate,
  sourceRegistration: {
    floorId: 'floor-0',
    confidence: 1,
    anchors: [
      { wallId: 'w1', endpoint: 'start', image: { x: 470 / 1086, y: 72 / 1536 } },
      { wallId: 'w12', endpoint: 'end', image: { x: 470 / 1086, y: 1397 / 1536 } },
    ],
  },
};

const curvedGeometryOnlyCandidate = {
  ...curvedCandidate,
  sourceRegistration: {
    floorId: 'floor-0',
    confidence: 1,
    anchors: [
      { wallId: 'w1', endpoint: 'start', image: { x: 655 / 1536, y: 91 / 1152 } },
      { wallId: 'w13', endpoint: 'end', image: { x: 824 / 1536, y: 1059 / 1152 } },
    ],
  },
};

const curvedBoundaryOnlyReference = {
  ...curvedReference,
  walls: {
    coverage: 'partial',
    items: curvedReference.walls.items.filter(item => item.id === 'living-balcony-curve'),
  },
};

describe('source-space reconstruction quality', () => {
  it('scores a complete perfect source reference bidirectionally', () => {
    const report = scoreReconstructionAgainstSourceReference(squareCandidate, completeSquareReference, source);

    expect(report.walls?.precision).toBe(1);
    expect(report.walls?.recall).toBe(1);
    expect(report.walls?.f1).toBe(1);
    expect(report.doors?.precision).toBe(1);
    expect(report.doors?.recall).toBe(1);
    expect(report.windows?.f1).toBe(1);
    expect(report.topology.roomCountDelta).toBe(0);
  });

  it('does not invent precision or F1 from a partial wall annotation', () => {
    const partialReference = {
      ...completeSquareReference,
      walls: {
        coverage: 'partial',
        items: [{ id: 'top-only', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
      },
      roomCount: undefined,
    } as const;
    const report = scoreReconstructionAgainstSourceReference(squareCandidate, partialReference, source);

    expect(report.walls?.recall).toBe(1);
    expect(report.walls?.precision).toBeNull();
    expect(report.walls?.f1).toBeNull();
    expect(report.walls?.candidateToReference).toBeNull();
    expect(report.topology.referenceRoomCount).toBeNull();
    expect(report.topology.roomCountDelta).toBeNull();
  });

  it('rejects source dimension drift instead of rescaling the reference', () => {
    expect(() => scoreReconstructionAgainstSourceReference(
      squareCandidate,
      completeSquareReference,
      { ...source, width: 101 },
    )).toThrow(/do not match reference/);
  });

  it('rejects candidates without explicit source registration', () => {
    const { sourceRegistration: _registration, ...unregistered } = squareCandidate;
    expect(() => scoreReconstructionAgainstSourceReference(unregistered, completeSquareReference, source))
      .toThrow(/explicit source registration/);
  });

  it('exposes spatial error in the historical black-plan blind reconstruction', () => {
    const report = scoreReconstructionAgainstSourceReference(
      blackCandidate,
      blackReference,
      { dataUrl: 'data:image/jpeg;base64,AA==', width: 1199, height: 1536 },
    );

    expect(report.walls?.annotationCoverage).toBe('partial');
    expect(report.walls?.precision).toBeNull();
    expect(report.walls?.f1).toBeNull();
    expect(report.walls?.candidateToReference).toBeNull();
    expect(report.walls?.recall).toBeGreaterThan(0);
    expect(report.walls?.recall).toBeLessThan(0.98);
    expect(report.doors).toBeNull();
    expect(report.windows).toBeNull();

    console.info('Plan2World hard-corpus source score', JSON.stringify({
      sample: 'black-hidden-doors',
      walls: report.walls,
      topology: report.topology,
    }));
  });

  it('keeps invalid historical registration visible for YJ215 and One Hyde Park', () => {
    expect(() => scoreReconstructionAgainstSourceReference(
      yjCandidate,
      yjReference,
      { dataUrl: 'data:image/jpeg;base64,AA==', width: 1536, height: 1026 },
    )).toThrow(/source registration is inconsistent/);

    expect(() => scoreReconstructionAgainstSourceReference(
      hydeCandidate,
      hydeReference,
      { dataUrl: 'data:image/jpeg;base64,AA==', width: 1086, height: 1536 },
    )).toThrow(/source registration is inconsistent/);
  });

  it('scores YJ215 geometry separately under a two-anchor benchmark normalization', () => {
    const report = scoreReconstructionAgainstSourceReference(
      yjGeometryOnlyCandidate,
      yjReference,
      { dataUrl: 'data:image/jpeg;base64,AA==', width: 1536, height: 1026 },
    );

    expect(report.walls?.annotationCoverage).toBe('partial');
    expect(report.walls?.recall).toBeGreaterThan(0.25);
    expect(report.walls?.recall).toBeLessThan(0.5);
    expect(report.walls?.referenceToCandidate.p95ErrorPx).toBeGreaterThan(50);
    expect(report.walls?.precision).toBeNull();
    expect(report.doors).toBeNull();
    expect(report.windows).toBeNull();

    console.info('Plan2World hard-corpus source score', JSON.stringify({
      sample: 'decorated-yj215',
      mode: 'two-anchor-geometry-only',
      walls: report.walls,
      topology: report.topology,
    }));
  });

  it('scores One Hyde Park geometry separately under a two-anchor benchmark normalization', () => {
    const report = scoreReconstructionAgainstSourceReference(
      hydeGeometryOnlyCandidate,
      hydeReference,
      { dataUrl: 'data:image/jpeg;base64,AA==', width: 1086, height: 1536 },
    );

    expect(report.walls?.annotationCoverage).toBe('partial');
    expect(report.walls?.recall).toBeGreaterThan(0.15);
    expect(report.walls?.recall).toBeLessThan(0.35);
    expect(report.walls?.referenceToCandidate.p95ErrorPx).toBeGreaterThan(30);
    expect(report.walls?.precision).toBeNull();
    expect(report.doors).toBeNull();
    expect(report.windows).toBeNull();

    console.info('Plan2World hard-corpus source score', JSON.stringify({
      sample: 'one-hyde-park',
      mode: 'two-anchor-geometry-only',
      walls: report.walls,
      topology: report.topology,
    }));
  });

  it('keeps the accepted but poor historical registration visible for curved Lianjia', () => {
    const report = scoreReconstructionAgainstSourceReference(
      curvedCandidate,
      curvedReference,
      { dataUrl: 'data:image/jpeg;base64,AA==', width: 1536, height: 1152 },
    );

    expect(report.walls?.annotationCoverage).toBe('partial');
    expect(report.walls?.recall).toBeGreaterThan(0.05);
    expect(report.walls?.recall).toBeLessThan(0.2);
    expect(report.walls?.referenceToCandidate.p95ErrorPx).toBeGreaterThan(100);
    expect(report.walls?.precision).toBeNull();
    expect(report.doors).toBeNull();
    expect(report.windows).toBeNull();

    console.info('Plan2World hard-corpus source score', JSON.stringify({
      sample: 'curved-lianjia',
      mode: 'historical-registration',
      walls: report.walls,
      topology: report.topology,
    }));
  });

  it('separates curved Lianjia geometry from registration with two source anchors', () => {
    const sourceImage = { dataUrl: 'data:image/jpeg;base64,AA==', width: 1536, height: 1152 };
    const report = scoreReconstructionAgainstSourceReference(
      curvedGeometryOnlyCandidate,
      curvedReference,
      sourceImage,
    );
    const curveReport = scoreReconstructionAgainstSourceReference(
      curvedGeometryOnlyCandidate,
      curvedBoundaryOnlyReference,
      sourceImage,
    );

    expect(report.walls?.annotationCoverage).toBe('partial');
    expect(report.walls?.recall).toBeGreaterThan(0.1);
    expect(report.walls?.recall).toBeLessThan(0.25);
    expect(report.walls?.referenceToCandidate.p95ErrorPx).toBeGreaterThan(80);
    expect(report.walls?.precision).toBeNull();
    expect(report.doors).toBeNull();
    expect(report.windows).toBeNull();
    expect(curveReport.walls?.recall).toBeLessThan(0.05);
    expect(curveReport.walls?.referenceToCandidate.p95ErrorPx).toBeGreaterThan(120);

    console.info('Plan2World hard-corpus source score', JSON.stringify({
      sample: 'curved-lianjia',
      mode: 'two-anchor-geometry-only',
      walls: report.walls,
      curveOnlyWalls: curveReport.walls,
      topology: report.topology,
    }));
  });
});
