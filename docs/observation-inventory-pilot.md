# Global observation inventory pilot

This is an opt-in direct-Skill experiment on `observation-v2`, not a change to
the browser prompt, portable Skill or reconstruction algorithms. Keep the same
original raster and original-pixel overview/3×3 evidence views. Add only a working
global inventory during the existing architectural observation.

## Procedure

1. Before serializing coordinates, list visible architectural features by broad
   region: perimeter, shared partitions, apertures, functional zones and crowded
   junctions. Give each physical feature one human-readable label. Neighboring
   regions refer to that same entry instead of copying their common wall. Include
   uncertain/rejected features and blank or out-of-scope regions with reasons.
2. Record which source views show each feature. For cross-region features, record
   a single owner in the working inventory and the other regions as references.
   Ownership organizes the observation; it does not assign a native wall ID,
   determine a host or calculate topology.
3. During the same observation, emit the existing `walls`, `openings`,
   `functionalZones` and optional `junctions`. Preserve the inventory labels in
   those records. Each inventory entry maps to one actual record, or has an
   explicit exclusion reason. A prose claim without a corresponding observation
   is not coverage. This working ledger is a disposable sidecar, not another
   scene representation or a required application schema.
4. Reconcile the label mapping and shared-feature references before freezing.
   Check a crossing partition against the visible aperture jambs; do not infer
   access from room use or invent an opening to improve reachability. Unresolved
   source evidence remains uncertain. Do not normalize, match hosts or run
   closure during the observation.
5. Freeze the architecture and ledger together, then observe furniture only.
   Run the unchanged strict preparation/assembly, native inspection, source
   overlay and runtime export. Preserve failures. Read-only checks may report
   duplicate/missing mappings, but never deduplicate or edit geometry. A failing
   check does not authorize another architectural pass within this execution.

## First pilot and decision criteria

Start with original image `1000028465.jpg` (the black-background office plan).
The previous views-only execution failed on overlapping shared-wall observations;
the earlier baseline completed. This deliberately selected known failure makes
the pilot useful for feasibility, but not a blind comparison or a quality claim.
Do not reuse either run's coordinates, observations or generated artifacts.

Record raw accepted/uncertain/rejected feature counts, actual mapping coverage,
strict tool exits, unresolved accepted apertures, geometry/connectivity findings
and visual source discrepancies. More records, closed regions or passing tools
do not by themselves establish fidelity. Compare earlier evidence only after the
new draft and overlay are frozen, or after an unrecoverable generation failure.

Success permits testing the same procedure on the other original images. It
does not justify changing the default workflow. A general improvement needs
multi-image results and repeated/provider-controlled trials; familiarity,
attention and token use remain confounders in direct-Codex experiments.

## Evaluation scope and remaining cases

The user excludes the office image's ambiguous concealed doors from recognition
quality scoring. Keep their uncertainty and raw connectivity diagnostics intact;
do not add doors or require every region to be reachable through unsupported
evidence. Other source and geometry findings remain reviewable.

Continue with the diagonal apartment, then the curved apartment, conventional
home and recessed large home. Keep this observation procedure and deterministic
algorithms fixed during those trials. Do not combine selected results from
different runs into a new five-image pass rate. Only a later uniform rerun can
support that comparison. Source fidelity, strict generation and runtime checks
remain separate outcomes; uncertain source evidence is reported separately.
