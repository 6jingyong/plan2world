#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Load the application's own parser, conversion, geometry checks and image
// registration. This command never calls an AI provider or duplicates geometry.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  if (!['--draft', '--source', '--width', '--height', '--output'].includes(key) || !args[i + 1]) {
    throw new Error('Usage: --draft draft.json --source source.jpg --width W --height H [--output directory]');
  }
  options[key.slice(2)] = args[i + 1];
}
if (!options.draft || !options.source || ![Number(options.width), Number(options.height)].every(n => Number.isFinite(n) && n > 0)) {
  throw new Error('Provide draft, source, and positive original source width/height.');
}
const server = await createServer({ root, configFile: false, logLevel: 'error',
  resolve: { alias: { '$lib': resolve(root, 'src/lib') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
try {
  const [{ parsePlan2WorldDraft, draftToProject }, { summarizePlan2WorldDraft }, { sourceBackgroundForRegistration }, { buildReconstructionTrace }] = await Promise.all([
    server.ssrLoadModule('/src/lib/plan2world/draft.ts'),
    server.ssrLoadModule('/src/lib/plan2world/review.ts'),
    server.ssrLoadModule('/src/lib/plan2world/sourceBackground.ts'),
    server.ssrLoadModule('/src/lib/plan2world/reconstructionTrace.ts'),
  ]);
  const draft = parsePlan2WorldDraft(JSON.parse(await readFile(resolve(options.draft), 'utf8')));
  const bytes = await readFile(resolve(options.source));
  const mimeType = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : 'image/webp';
  const source = { width: Number(options.width), height: Number(options.height), dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
  const summary = summarizePlan2WorldDraft(draft), project = draftToProject(draft);
  const registrationAccepted = !!(draft.sourceRegistration && sourceBackgroundForRegistration(draft, source, draft.sourceRegistration));
  const report = { source: { width: source.width, height: source.height, sha256: createHash('sha256').update(bytes).digest('hex') },
    presentation: draft.presentation ?? 'legacy', ...summary, registrationAccepted,
    nativeRooms: project.floors.reduce((n, floor) => n + floor.rooms.length, 0),
    furnitureCount: project.floors.reduce((n, floor) => n + floor.furniture.length, 0),
    limitation: 'Structural checks and registration consistency do not certify source-image accuracy.' };
  if (options.output) {
    const output = resolve(options.output); await mkdir(output, { recursive: true });
    for (const [name, value] of [['inspection.json', report], ['project.json', project], ['trace.json', buildReconstructionTrace(draft, source)]]) {
      await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (summary.geometryErrorCount || !registrationAccepted) process.exitCode = 1;
} finally { await server.close(); }
