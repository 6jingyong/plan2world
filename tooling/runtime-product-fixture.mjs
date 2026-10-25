import { runtimeWalkthroughProject } from './runtime-walkthrough-fixture.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runtimeProductProject() {
  const project = await runtimeWalkthroughProject();
  const floor = project.floors[0];
  floor.doors.push({ id:'main-entry', wallId:'ground-w0', position:.25, width:100, height:220, type:'single', swingDirection:'left', flipSide:false });
  floor.entrance={ doorId:'main-entry', side:'left' }; delete floor.walkthroughStart;
  return project;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2]);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory,'product.project.json'),JSON.stringify(await runtimeProductProject()));
}
