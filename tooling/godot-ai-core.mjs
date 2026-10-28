import { createInterface } from 'node:readline';
import { runDesktopAiTask } from './desktop-ai-tasks.mjs';
import { safeDesktopError } from './desktop-ai-errors.mjs';

// Optional desktop AUTHORING task, never used by the runtime scene loader.
// Secrets cross private stdio only; no keys in arguments, requests, projects or logs.
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
async function run() {
try {
  const lines = createInterface({ input: process.stdin });
  const first = await lines[Symbol.asyncIterator]().next(); lines.close();
  if (first.done || first.value.length > 64 * 1024) throw new Error('Invalid native authoring request.');
  const request = JSON.parse(first.value);
  const result = await runDesktopAiTask(request, emit);
  emit({ done: true, result });
} catch (error) {
  // Provider/network internals may contain secrets: only known product errors
  // leave this process. Unexpected details never become engine console output.
  emit({ done: true, result: { ok: false, error: safeDesktopError(error) } });
  process.exitCode = 1;
}
}
run();
