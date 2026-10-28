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
    'Export a runtime scene ZIP in the Plan2World editor. Extract it anywhere, then choose Explore a scene in this player.\n' +
    'Keep the executable, PCK and core/ folder together. Keep each scene JSON, architecture GLB and assets folder together.\n' +
    'For furniture layout, choose Arrange a Project and select native Project JSON or a Project package ZIP.\n' +
    'Read README.zh-CN.md for the plugin/Skill and standalone desktop workflows.\n' +
    'Optional Create from a floor plan: prepare a photo locally using four corners and a known rectangle proportion, preview and confirm. Flat plans work directly. Connect OpenRouter, choose a vision model and explicitly confirm two paid observations of the same prepared image. Credentials are session-only; no automatic paid retries. Choose the main entrance and inward side before opening the generated Project.\n' +
    'F2 switches between first-person perspective and orthographic top view in the same Godot world.\n' +
    'Top view is an unlit plan: dark walls, orange doors and blue windows. Choose Furniture or Ceiling lights in the layer selector.\n' +
    'Top view: middle/right drag pans, wheel zooms, left drag moves furniture, Esc cancels a drag.\n' +
    'Top-view dragging: optional 10 cm grid, straight-wall alignment and nearby furniture guides. Hold Alt for free placement; first-person micro-adjustment never snaps.\n' +
    'Place in room prepares a cancellable footprint preview; click a valid landing to accept. Swap uses the same preview. Wall/ceiling installation offers exact lists and direct host picking.\n' +
    'Add, rotate, replace or delete furniture; save native Project and export a runtime scene ZIP. No undo or operation history.\n' +
    'Build... in top view paves explicit polygon ground or adds doors/windows through categorized choices and cancellable host/width previews. Accepted outside edges have invisible player guards, including exposed ground; shared ground seams stay passable and floor holes remain open.\n' +
    'Advanced wall correction starts disabled. Explicit corrections mark current walls in amber and protect repeat changes unless marked-wall editing is enabled; no Undo/Redo or operation history.\n' +
    'Correct walls and openings opens the retained plan with located source notes. Draw/move/split/delete native wall segments and add/rehost doors/windows; save incomplete Projects, and apply to space only after strict floor/entry/placement checks pass. Source observations remain intact; no model repair request is added.\n' +
    'A valid Project rejected by geometry/entrance checks offers an explicit Open this Project for correction action without picking its file again. Operational file/asset errors remain failures; current world and unsaved-change protections are retained.\n' +
    'Desktop reconstruction can restore the last saved task or open a checkpoint.json. Continue requests only missing observations (2/1/0); complete observations reassemble offline without an account. Every paid continuation requires consent. Original inputs/observations and previous attempts are retained, and credentials stay session-only. Reported tokens/cached/reasoning subsets, text bytes and current-attempt cost are shown separately; absent usage or interrupted billing is unknown, with no automatic retry.\n' +
    'Choose entrance / Start previews the actual main door and an amber inward arrow; Confirm entrance saves it, Cancel only clears the preview. No wall-edit permission is needed. Source marker blocks carry position-only evidence and reserve no arbitrary furniture footprint; real replacements retain complete support and door clearance. New geometry defaults to polygons; existing Project curves remain compatible.\n' +
    'Select furniture, a door or window, then click the compact Modify M action. The same categorized thumbnail catalog used for adding handles replacement, with an explicit preview/apply and cancellation. Rotation/removal/light actions live in the edit catalog. Add and Modify retain separate filters.\n' +
    'In walkthrough aim and press M to modify that object. Door cards offer wood, glass or metal/security presentation while retaining physics and open state; window-type cards retain the aperture and physics. Size / position enters the same-world host/position/width/height preview; Panels… retains advanced settings for this door. Furniture replacement enters the existing plan placement preview.\n' +
    'Existing scenes, furniture editing and export run offline without an account. Only optional image creation/account connection uses the network and your OpenRouter credits.\n\n' +
    'WASD move | Ctrl slow | Shift fast | Mouse look | E door | Esc mouse | F1 scene menu\n' +
    'The scene menu pauses the current walkthrough. Failed scene opens can be dismissed by resuming it.\n\n' +
    'Switching windows pauses and clears held controls. Resume explicitly when you return.\n' +
    'Return to start restores the compiled player spawn and view without resetting open doors or scene geometry.\n\n' +
    'First person: F / gamepad X selects furniture; arrows / left stick nudge; F / Enter / A places; Esc / B cancels preview. Floor furniture stays on its floor; mounted items stay on their authored wall.\n\n' +
    'Ceiling lights require an explicit supported ceiling and stay at its height. L adjusts the selected/aimed light (on/off, lumens, colour temperature). T / the HUD selects Day, Night, Sunrise or Sunset; natural lighting is session view state.\n\n' +
    'Default renderer: Forward+. Requires a compatible GPU/driver. For older hardware, run with --rendering-method gl_compatibility.\n' +
    'Windows builds are unsigned. Platform signing and Windows hardware acceptance are separate release steps.\n\n' +
    'Optional CLI: player -- --scene "path/to/scene.runtime.json"\n');
  await writeFile(path.join(directory, 'LICENSE-Plan2World.txt'), await readFile(path.join(root, 'LICENSE')));
  const guide = (await readFile(path.join(root, 'docs/user-guide.zh-CN.md'), 'utf8'))
    .replaceAll('](../skills/', '](https://github.com/6jingyong/plan2world/blob/main/skills/')
    .replace('](godot-furniture-layout.md)', '](https://github.com/6jingyong/plan2world/blob/main/docs/godot-furniture-layout.md)');
  await writeFile(path.join(directory, 'README.zh-CN.md'), guide);
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
