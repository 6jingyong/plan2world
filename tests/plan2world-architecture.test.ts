import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preflightArchitectureObservation, prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { prepareFloorPlanImage } from '../tooling/prepare-floorplan-image.mjs';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';
import { readProject } from '$lib/utils/projectValidation';

function evidence() {
  const decision = { decision: 'accept', decisionBasis: 'Visible source stroke.', evidence: 'Architectural line.' };
  return { schemaVersion: 'source-architecture-v1',
    scaleEvidence: { kind: 'measured_dimension', realLengthCm: 100, endpoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }], evidence: 'Printed 100 cm dimension.' },
    walls: [
      { label: 'north', ...decision, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { label: 'east', ...decision, start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { label: 'south', ...decision, start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
      { label: 'west', ...decision, start: { x: 0, y: 100 }, end: { x: 0, y: 0 } },
    ],
    openings: [{ label: 'entry', ...decision, kind: 'door', endpoints: [{ x: 20, y: 100 }, { x: 60, y: 100 }],
      uncertainty: 'Operation is unresolved; jambs establish an aperture.' }], assumptions: [] };
}
const context = { sourceWidthPx: 100, sourceHeightPx: 100 };

describe('single architectural observation with frozen opening evidence', () => {
  it('preflights immutable observations without accepting opening hosts or final geometry', () => {
    const input = evidence(); input.openings[0].endpoints = [{ x: 30, y: 50 }, { x: 70, y: 50 }];
    const before = JSON.stringify(input);
    const checked = preflightArchitectureObservation(input, context);
    expect(checked.walls).toEqual(input.walls);
    expect(checked.openings[0].endpoints).toEqual(input.openings[0].endpoints);
    expect(checked).not.toHaveProperty('bareHouse');
    expect(checked).not.toHaveProperty('architectureDraft');
    expect(prepareArchitectureStage(checked, context).openingAudit[0].programStatus).toBe('unresolved-host');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('CLI preflight writes only a scoped read-only receipt and refuses overwrites', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plan2world-preflight-'));
    try {
      const input = join(directory, 'architecture.json'), output = join(directory, 'preflight');
      await writeFile(input, JSON.stringify(evidence()));
      const args = ['tooling/plan2world-architecture.mjs', 'preflight', '--input', input, '--output', output, '--source-width', '100', '--source-height', '100'];
      execFileSync(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' });
      const receipt = await readFile(join(output, 'observation-preflight.json'), 'utf8');
      expect(JSON.parse(receipt)).toMatchObject({ scope: 'source-consistency-before-furnishing', observationsChanged: false,
        openingHostsEvaluated: false, finalClosureEvaluated: false, acceptedWallCount: 4 });
      expect(() => execFileSync(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' })).toThrow();
      expect(await readFile(join(output, 'observation-preflight.json'), 'utf8')).toBe(receipt);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('retains an observed aperture when operation is unknown and keeps architecture unchanged during furnishing', () => {
    const input = evidence(), before = JSON.stringify(input);
    const stage = prepareArchitectureStage(input, context), saved = JSON.stringify(stage);
    const result = assembleFrozenArchitecture(JSON.parse(saved), { schemaVersion: 'source-furnishing-v1',
      furniture: [{ sourceCategory: 'chair', position: { x: 50, y: 50 } }], assumptions: [] });
    expect(result.draft.floors[0].doors).toEqual(stage.architectureDraft.floors[0].doors);
    expect(result.draft.floors[0].walls).toEqual(stage.architectureDraft.floors[0].walls);
    expect(result.draft.floors[0].furniture).toHaveLength(1);
    expect(result.architectureUnchanged).toBe(true);
    expect(stage.openingAudit[0].programStatus).toBe('assembled');
    expect(stage.openingAudit[0].programWarnings).toContain('door operation is unresolved');
    expect(stage.openingAudit[0].uncertainty).toContain('jambs');
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(stage)).toBe(saved);
  });

  it.each(['openings', 'walls', 'scaleEvidence'])('rejects a furniture pass that tries to reconsider %s', field => {
    const stage = prepareArchitectureStage(evidence(), context);
    expect(() => assembleFrozenArchitecture(stage, { schemaVersion: 'source-furnishing-v1', furniture: [], [field]: [] }))
      .toThrow(`unsupported fields: ${field}`);
  });

  it('detects changes to the frozen program output rather than trusting a hand-repaired stage', () => {
    const stage = prepareArchitectureStage(evidence(), context);
    stage.architectureDraft.floors[0].doors = [];
    expect(() => assembleFrozenArchitecture(stage, { schemaVersion: 'source-furnishing-v1', furniture: [] })).toThrow(/Frozen architecture stage is inconsistent/);
  });

  it('keeps uncertain and rejected candidates in the audit without creating their openings', () => {
    const input = evidence();
    for (const decision of ['uncertain', 'reject']) input.openings.push({ ...input.openings[0], label: decision, decision });
    const stage = prepareArchitectureStage(input, context);
    expect(stage.architectureDraft.floors[0].doors).toHaveLength(1);
    expect(stage.openingAudit.map(item => item.programStatus)).toEqual(['assembled', 'not-applied', 'not-applied']);
    expect(stage.architectureDraft.assumptions?.some(item => item.startsWith('uncertain: uncertain.'))).toBe(true);
  });

  it('records a failed host association explicitly instead of claiming an accepted observation was assembled', () => {
    const input = evidence(); input.openings[0].endpoints = [{ x: 30, y: 50 }, { x: 70, y: 50 }];
    const stage = prepareArchitectureStage(input, context);
    expect(stage.openingAudit[0].programStatus).toBe('unresolved-host');
    expect(stage.openingAudit[0].programWarnings.join(' ')).toContain('do not resolve');
    const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: [] };
    expect(() => assembleFrozenArchitecture(stage, furnishing)).toThrow(/unresolved accepted openings/);
    const diagnostic = assembleFrozenArchitecture(stage, furnishing, { allowUnresolvedOpenings: true });
    expect(diagnostic.validationStatus).toBe('diagnostic-unresolved-openings');
    expect(diagnostic.draft.floors[0].doors).toHaveLength(0);
  });

  it('rejects original-raster coordinate drift', () => {
    const input = evidence(); input.walls[0].start.x = -1;
    expect(() => prepareArchitectureStage(input, context)).toThrow(/outside the original source raster/);
  });

  it('keeps visible junction evidence in source pixels and rejects model-authored associations', () => {
    const input: any = evidence();
    input.junctions = [{ label: 'corner', position: { x: 100, y: 0 }, evidence: 'Two visible strokes meet.',
      decision: 'accept', decisionBasis: 'Continuous corner.' }];
    const stage = prepareArchitectureStage(input, context);
    expect(stage.sourceTopologyReview.junctionEvidence[0].nearbyWallIds).toEqual(['w1', 'w2']);
    expect(stage.architecture.junctions[0].position).toEqual({ x: 100, y: 0 });
    input.junctions[0].wallIds = ['w1', 'w2'];
    expect(() => prepareArchitectureStage(input, context)).toThrow(/unsupported fields: wallIds/);
    delete input.junctions[0].wallIds;
    input.junctions[0].position.x = 101;
    expect(() => prepareArchitectureStage(input, context)).toThrow(/outside the original source raster/);
  });

  it('refuses to overwrite a previously generated stage on disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plan2world-architecture-'));
    try {
      const input = join(directory, 'architecture.json'), output = join(directory, 'prepared');
      await writeFile(input, JSON.stringify(evidence()));
      const args = ['tooling/plan2world-architecture.mjs', 'prepare', '--input', input, '--output', output, '--source-width', '100', '--source-height', '100'];
      execFileSync(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' });
      const before = await readFile(join(output, 'architecture-stage.json'), 'utf8');
      expect(() => execFileSync(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' })).toThrow();
      expect(await readFile(join(output, 'architecture-stage.json'), 'utf8')).toBe(before);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('CLI hands the same confirmed input to the native Project and rejects a different image with identical dimensions',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'p2w-cli-photo-handoff-'));
    try{
      const imagePath=join(directory,'original.png'),rasterPath=join(directory,'original.rgba'),data=Buffer.alloc(100*100*4,255);
      await writeFile(imagePath,encodeRgbaPng({width:100,height:100,data}));await writeFile(rasterPath,data);
      const prepared=await prepareFloorPlanImage({imagePath,rasterPath,width:100,height:100,pixelOrientation:'upright',recipe:{mode:'perspective',quarterTurns:0,corners:[{x:.1,y:.1},{x:.9,y:.15},{x:.85,y:.9},{x:.15,y:.85}],aspectRatio:1,outputWidth:100},outputDirectory:join(directory,'input')});
      const furnishing={schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:{x:50,y:50}}]};
      const stage=prepareArchitectureStage(evidence(),{...context,sourceImageSha256:prepared.manifest.working.sha256},furnishing);
      const stagePath=join(directory,'stage.json'),furnishingPath=join(directory,'furnishing.json');await writeFile(stagePath,JSON.stringify(stage));await writeFile(furnishingPath,JSON.stringify(furnishing));
      const output=join(directory,'assembled'),args=['tooling/plan2world-architecture.mjs','assemble','--stage',stagePath,'--furnishing',furnishingPath,'--source',prepared.imagePath,'--input-preparation',prepared.manifestPath,'--original-image',prepared.originalPath,'--output',output];
      execFileSync(process.execPath,args,{env:{...process.env,NODE_ENV:'production'},stdio:'pipe'});
      const project=readProject(JSON.parse(await readFile(join(output,'project.json'),'utf8')));
      expect(project.reconstruction?.inputPreparation?.manifest).toEqual(prepared.manifest);
      expect(project.reconstruction?.inputPreparation?.originalDataUrl).toBe('data:image/png;base64,'+(await readFile(imagePath)).toString('base64'));
      expect(project.floors[0].backgroundImage?.dataUrl).toBe('data:image/png;base64,'+(await readFile(prepared.imagePath)).toString('base64'));
      expect(project.floors[0].entrance).toBeUndefined();
      expect(project.reconstruction?.observationReview).toBeDefined();
      const changed=Buffer.alloc(data.length,0);for(let i=3;i<changed.length;i+=4)changed[i]=255;
      await writeFile(prepared.imagePath,encodeRgbaPng({width:100,height:100,data:changed}));
      const altered=JSON.parse(await readFile(prepared.manifestPath,'utf8'));altered.working.sha256=createHash('sha256').update(await readFile(prepared.imagePath)).digest('hex');await writeFile(prepared.manifestPath,JSON.stringify(altered));
      const wrongOutput=join(directory,'wrong-input'),badArgs=[...args.slice(0,-1),wrongOutput];
      let failure='';try{execFileSync(process.execPath,badArgs,{env:{...process.env,NODE_ENV:'production'},stdio:'pipe'});}catch(error:any){failure=String(error.stderr);}
      expect(failure).toContain('does not match the frozen stage');
      await expect(access(wrongOutput)).rejects.toThrow();
      expect(JSON.parse(await readFile(stagePath,'utf8'))).toEqual(stage);
      expect(()=>preflightArchitectureObservation(evidence(),{...context,sourceImageSha256:'bad'})).toThrow(/SHA-256/);
    }finally{await rm(directory,{recursive:true,force:true});}
  },30_000);
});
