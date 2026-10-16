export const PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION = 'plan2world-reconstruction-experiment-v1' as const;

export interface ReconstructionExperimentMetadata {
  schemaVersion: typeof PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION;
  sampleId: string;
  sourceSha256: string;
  model: string;
  promptVersion: string;
  createdAt?: string;
  notes?: string[];
}

export class ReconstructionExperimentMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReconstructionExperimentMetadataError';
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReconstructionExperimentMetadataError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReconstructionExperimentMetadataError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

export function parseReconstructionExperimentMetadata(input: unknown): ReconstructionExperimentMetadata {
  const root = record(input, 'experiment');
  if (root.schemaVersion !== PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION) {
    throw new ReconstructionExperimentMetadataError(
      `experiment.schemaVersion must be ${PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION}`,
    );
  }

  const sourceSha256 = nonEmptyString(root.sourceSha256, 'experiment.sourceSha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceSha256)) {
    throw new ReconstructionExperimentMetadataError('experiment.sourceSha256 must be a 64-character hexadecimal SHA-256');
  }

  let createdAt: string | undefined;
  if (root.createdAt !== undefined) {
    createdAt = nonEmptyString(root.createdAt, 'experiment.createdAt');
    if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
      throw new ReconstructionExperimentMetadataError('experiment.createdAt must be an ISO-8601 timestamp');
    }
  }

  let notes: string[] | undefined;
  if (root.notes !== undefined) {
    if (!Array.isArray(root.notes)) {
      throw new ReconstructionExperimentMetadataError('experiment.notes must be an array');
    }
    notes = root.notes.map((note, index) => nonEmptyString(note, `experiment.notes[${index}]`));
  }

  return {
    schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
    sampleId: nonEmptyString(root.sampleId, 'experiment.sampleId'),
    sourceSha256,
    model: nonEmptyString(root.model, 'experiment.model'),
    promptVersion: nonEmptyString(root.promptVersion, 'experiment.promptVersion'),
    createdAt,
    notes,
  };
}
