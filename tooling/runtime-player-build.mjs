#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { buildLayoutCore } from './build-layout-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const targets = { windows: ['Windows Desktop', 'Plan2World.exe'], linux: ['Linux', 'Plan2World.x86_64'] };
const [target, output, ...extra] = process.argv.slice(2);
if (!targets[target] || !output || extra.length) {
  console.error('Usage: npm run runtime:player -- <windows|linux> <new-output-directory>\nSet GODOT_BIN to Godot 4.7.2 with its official export templates installed.');
  process.exit(2);
}
try {
  const godot = process.env.GODOT_BIN || 'godot';
  const version = execFileSync(godot, ['--version'], { encoding: 'utf8' }).trim();
  if (!version.startsWith('4.7.2.stable.')) throw new Error(`Expected Godot 4.7.2 stable, received ${version}`);
  const directory = path.resolve(output);
  // Refuse to mix old executable/PCK pairs or overwrite a user's directory.
  if ((await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; })).length) {
    throw new Error('Output directory must be empty or new.');
  }
  await mkdir(directory, { recursive: true });
  const [preset, filename] = targets[target];
  const project = path.join(root, 'runtime/godot');
  execFileSync(godot, ['--headless', '--path', project, '--editor', '--import'], { stdio: 'inherit' });
  execFileSync(godot, ['--headless', '--path', project, '--export-release', preset, path.join(directory, filename)], { stdio: 'inherit' });
  if (target === 'linux') await chmod(path.join(directory, filename), 0o755);
  await buildLayoutCore(path.join(directory, 'core'), target === 'windows' ? 'win32' : 'linux');
  await writeFile(path.join(directory, 'README.txt'),
    `Plan2World Runtime (Godot ${version})\n\n` +
    `Extract this whole player ZIP, then start ${filename}. No Godot editor or Node.js is required.\n` +
    'Export a runtime scene ZIP in the Plan2World editor. Extract it anywhere, then choose Open runtime scene in this player.\n' +
    'Keep the executable, PCK and core/ folder together. Keep each scene JSON, architecture GLB and assets folder together.\n' +
    'For furniture layout, choose Open editable Project and select native Project JSON or a Project package ZIP.\n' +
    'F2 switches smoothly between first-person and top view in the same Godot world.\n' +
    'Top view: middle/right drag pans, wheel zooms, left drag moves furniture, Esc cancels a drag.\n' +
    'Add, rotate, replace or delete furniture; save native Project and export a runtime scene ZIP. No undo or operation history. Architecture stays fixed.\n' +
    'Scenes run offline; no account, AI or network service is used by the player.\n\n' +
    'WASD move | Ctrl slow | Shift fast | Mouse look | E door | Esc mouse | F1 scene menu\n' +
    'The scene menu pauses the current walkthrough. Failed scene opens can be dismissed by resuming it.\n\n' +
    'Switching windows pauses and clears held controls. Resume explicitly when you return.\n' +
    'Return to start restores the compiled player spawn and view without resetting open doors or scene geometry.\n\n' +
    'First person: F / gamepad X selects furniture; arrows / left stick nudge; F / Enter / A places; Esc / B cancels preview. Floor furniture stays on its floor; mounted items stay on their authored wall.\n\n' +
    'Default renderer: Forward+. Requires a compatible GPU/driver. For older hardware, run with --rendering-method gl_compatibility.\n' +
    'Windows builds are unsigned. Platform signing and Windows hardware acceptance are separate release steps.\n\n' +
    'Optional CLI: player -- --scene "path/to/scene.runtime.json"\n');
  await writeFile(path.join(directory, 'LICENSE-Plan2World.txt'), await readFile(path.join(root, 'LICENSE')));
  // Godot's generated copyright text includes its bundled third-party notices.
  const noticeScript = path.join(root, 'tooling/runtime-player-notices.gd');
  execFileSync(godot, ['--headless', '--script', noticeScript, '--', path.join(directory, 'LICENSE-Godot.txt')], { stdio: 'inherit' });
  const zip = new JSZip();
  for (const name of (await readdir(directory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort()) {
    zip.file(name, await readFile(path.join(directory, name)), {
      date: new Date('1980-01-01T00:00:00Z'), createFolders: false,
      unixPermissions: target === 'linux' && (name === filename || name === 'core/node') ? 0o100755 : 0o100644,
    });
  }
  const zipPath = directory + '.zip';
  await writeFile(zipPath, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' }));
  console.log(`Built ${zipPath}`);
} catch (error) {
  console.error(`Runtime player build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
