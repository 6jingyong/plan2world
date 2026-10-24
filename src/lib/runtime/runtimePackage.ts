import type { compileRuntimeArtifacts } from './runtimeArtifacts';

type RuntimeArtifacts = Awaited<ReturnType<typeof compileRuntimeArtifacts>>;
const encodeJSON = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/** A transport envelope for the existing artifacts, not another scene format.
 * Fixed filenames keep links portable, including on Windows. */
export function runtimePackageFiles(artifacts: RuntimeArtifacts): Map<string, Uint8Array> {
  const notes = [
    ...artifacts.assets.diagnostics.map(d => `Missing presentation asset: ${d.assetRef} (${d.reason}); proxy fallback.`),
    ...artifacts.architecture.diagnostics.map(d => `Architecture: ${d.entityId} [${d.code}] ${d.message}`),
    ...artifacts.runtime.entities.flatMap(entity => {
      if (entity.kind === 'door' && entity.interaction.kind === 'unsupported') return [`Unsupported door motion: ${entity.id} (${entity.interaction.sourceMotion}); remains a closed blocker.`];
      if (entity.kind === 'stair' && entity.traversal.kind === 'unsupported') return [`Unsupported stair traversal: ${entity.id} (${entity.traversal.reason}).`];
      return [];
    }),
  ];
  const entries: [string, Uint8Array][] = [
    ['scene.runtime.json', encodeJSON(artifacts.runtime)],
    ['scene.architecture.glb', artifacts.architectureGlb],
    ['scene.assets/manifest.json', encodeJSON(artifacts.assets.manifest)],
    ...[...artifacts.assets.files].map(([uri, bytes]): [string, Uint8Array] => [`scene.assets/${uri}`, bytes]),
    ['README.txt', new TextEncoder().encode(
      'Plan2World runtime scene\n\n' +
      'Extract this entire ZIP before opening it. Keep the files and scene.assets folder together.\n' +
      'Start the separate Plan2World Runtime player, choose Open runtime scene, and select scene.runtime.json.\n' +
      'The scene runs offline. Move or share this whole directory, not just the JSON.\n\n' +
      'WASD move | Ctrl slow | Shift fast | Mouse look | E door | Esc mouse | F1 scene menu\n\n' +
      'This is a compiled scene. Keep the native Project JSON/project package for editing.\n' +
      (notes.length ? `\nExport notes\n${notes.join('\n')}\n` : ''),
    )],
  ];
  return new Map(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

/** Byte-stable ZIP: no wall-clock timestamps, compression or platform metadata. */
export async function serializeRuntimePackage(artifacts: RuntimeArtifacts): Promise<Uint8Array<ArrayBuffer>> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [name, bytes] of runtimePackageFiles(artifacts)) {
    zip.file(name, bytes, { date: new Date('1980-01-01T00:00:00Z'), createFolders: false });
  }
  return Uint8Array.from(await zip.generateAsync({ type: 'uint8array', compression: 'STORE', platform: 'DOS' }));
}
