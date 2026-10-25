import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readProject } from '../src/lib/utils/projectValidation';
import { readProjectPackage } from '../src/lib/utils/projectPackageCodec';
import { applyFurnitureLayoutCommand, furnitureLayoutCatalog } from '../src/lib/runtime/furnitureLayout';
import { compileRuntimeArtifacts } from '../src/lib/runtime/runtimeArtifacts';
import { runtimePackageFiles, serializeRuntimePackage } from '../src/lib/runtime/runtimePackage';

// Private desktop-core transport. No AI/network/browser and no Godot types.
const [requestPath, responsePath] = process.argv.slice(2);
async function run() {
  try {
    const request = JSON.parse(await readFile(requestPath, 'utf8'));
    const bytes = await readFile(request.projectPath);
    const source = path.extname(request.projectPath).toLowerCase() === '.zip'
      ? readProjectPackage(new Uint8Array(bytes)).project : readProject(JSON.parse(bytes.toString('utf8')));
    let project = source, selectedId = null;
    if (request.op === 'command') ({ project, selectedId } = applyFurnitureLayoutCommand(source, request.command));
    else if (request.op !== 'open') throw new Error('Unsupported authoring operation.');
    const modelDirectory = path.join(path.dirname(process.argv[1]), 'models');
    const artifacts = await compileRuntimeArtifacts(project, async file => {
      try { return new Uint8Array(await readFile(path.join(modelDirectory, `${file}.glb`))); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    });
    const zip = await serializeRuntimePackage(artifacts);
    if (!artifacts.runtime.floors.some(floor => floor.walkthroughStart)) throw new Error('The Project has no valid compiled player start.');
    const output = path.resolve(request.outputDirectory);
    // Compile completely before creating the isolated candidate. Never write
    // into the source Project or replace the active scene on an invalid command.
    await mkdir(output);
    for (const [name, content] of runtimePackageFiles(artifacts)) {
      await mkdir(path.dirname(path.join(output, name)), { recursive: true });
      await writeFile(path.join(output, name), content, { flag: 'wx' });
    }
    await writeFile(path.join(output, 'project.json'), JSON.stringify(project, null, 2) + '\n', { flag: 'wx' });
    await writeFile(path.join(output, 'scene.runtime.zip'), zip, { flag: 'wx' });
    await writeFile(responsePath, JSON.stringify({ ok: true, projectPath: path.join(output, 'project.json'), runtimePath: path.join(output, 'scene.runtime.json'), packagePath: path.join(output, 'scene.runtime.zip'), selectedId,
      catalog: furnitureLayoutCatalog(project) }));
  } catch (error) {
    await writeFile(responsePath, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }

}
run();
