import type { Project } from '$lib/models/types';
import { PACKAGE_LIMIT, packageError } from '$lib/utils/projectPackageZip';
import { readProjectPackage, projectPackageBytes } from '$lib/utils/projectPackageCodec';
import { prepareLibraryRestore } from './libraryRestore';
export { PACKAGE_NOTICE, readProjectPackage, projectPackageBytes } from '$lib/utils/projectPackageCodec';

export async function prepareProjectPackage(file: File) {
  if (file.size > PACKAGE_LIMIT) packageError('The package exceeds 64 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer()), preview = readProjectPackage(bytes);
  const restore = prepareLibraryRestore(JSON.stringify({ [preview.project.id]: JSON.stringify(preview.project) }), file.name, 'Imported copy');
  return { ...preview, restore: restore.restore, bytes };
}
export function downloadProjectPackage(project: Project) {
  const bytes = projectPackageBytes(project);
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  const link = document.createElement('a'); link.href = url; link.download = 'openplan3d-project.zip'; link.click(); URL.revokeObjectURL(url);
}
