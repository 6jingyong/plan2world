/** A valid native Project whose pure runtime geometry needs review. File,
 * asset transport and artifact-write errors remain separate operational errors. */
export class RuntimeProjectError extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error));
    this.name = 'RuntimeProjectError';
  }
}
