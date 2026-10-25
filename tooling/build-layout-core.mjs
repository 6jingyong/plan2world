import { build } from 'esbuild';
import { mkdir, cp, copyFile, chmod, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const nodeVersion = '24.19.0';
const sources = {
  win32: ['win-x64/node.exe', '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'],
  linux: [`node-v${nodeVersion}-linux-x64.tar.xz`, '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647'],
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function verifiedDownload(url, file, sha256) {
  const cached = await readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (cached && digest(cached) === sha256) return;
  execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--retry', '3', '--output', file, url], { stdio: 'inherit' });
  if (digest(await readFile(file)) !== sha256) throw new Error(`Checksum mismatch: ${url}`);
}

/** Offline native-editing core shipped beside the player, with a verified x64
 * Node runtime. Godot owns all UI/input/physics; this bundle reuses Project and
 * compiler logic without importing the browser application. */
export async function buildLayoutCore(output, target = process.platform) {
  if (!sources[target]) throw new Error('Furniture editing currently supports Linux/Windows x64 players.');
  await mkdir(output, { recursive: true });
  const compiled = await build({ entryPoints: [path.join(root, 'tooling/godot-layout-core.mjs')], outfile: path.join(output, 'layout-core.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', alias: { '$lib': path.join(root, 'src/lib') }, logLevel: 'error', metafile: true });
  const cache = path.join(os.tmpdir(), `plan2world-node-${nodeVersion}`);
  await mkdir(cache, { recursive: true });
  const [source, sha256] = sources[target];
  const archive = path.join(cache, target === 'win32' ? 'node.exe' : 'node.tar.xz');
  await verifiedDownload(`https://nodejs.org/dist/v${nodeVersion}/${source}`, archive, sha256);
  const binary = path.join(output, target === 'win32' ? 'node.exe' : 'node');
  if (target === 'win32') await copyFile(archive, binary);
  else {
    execFileSync('tar', ['-xJf', archive, '-C', cache, `node-v${nodeVersion}-linux-x64/bin/node`]);
    await copyFile(path.join(cache, `node-v${nodeVersion}-linux-x64/bin/node`), binary);
    await chmod(binary, 0o755);
  }
  const license = path.join(cache, 'LICENSE-Node.txt');
  await verifiedDownload(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`, license, '148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5');
  await copyFile(license, path.join(output, 'LICENSE-Node.txt'));
  const packages = new Set();
  for (const input of Object.keys(compiled.metafile.inputs)) {
    const marker = input.lastIndexOf('node_modules/');
    if (marker < 0) continue;
    const parts = input.slice(marker + 13).split('/');
    packages.add(path.resolve(input.slice(0, marker + 13), ...parts.slice(0, parts[0].startsWith('@') ? 2 : 1)));
  }
  const notices = [];
  for (const directory of [...packages].sort()) {
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const files = (await readdir(directory)).filter(file => /^(license|copying)(\.|$)/i.test(file)).sort();
    if (!files.length) {
      const readme = await readFile(path.join(directory, 'README.md'), 'utf8').catch(() => '');
      if (readme.includes('Permission is hereby granted')) files.push('README.md');
    }
    if (!files.length) throw new Error(`Missing bundled dependency license: ${manifest.name}`);
    for (const file of files) notices.push(`${manifest.name} ${manifest.version} (${file})\n\n${await readFile(path.join(directory, file), 'utf8')}`);
  }
  await writeFile(path.join(output, 'LICENSE-Dependencies.txt'), notices.join('\n\n--------------------\n\n'));
  await cp(path.join(root, 'static/models'), path.join(output, 'models'), { recursive: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Expected an output directory.');
  await buildLayoutCore(path.resolve(process.argv[2]));
}
