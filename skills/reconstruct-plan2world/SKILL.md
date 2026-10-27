---
name: reconstruct-plan2world
description: Observe functional zones and architecture together, then use deterministic logical closure with furniture anchors and assemble Plan2World.
---

# Reconstruct Plan2World

Core rule: **LLM observes; programs calculate and assemble.**

Read stage references only when entering that stage:

- [references/architecture-pass.md](references/architecture-pass.md)
- [references/furnishing-pass.md](references/furnishing-pass.md)
- [references/contract.md](references/contract.md) for the final draft contract
- [references/furniture-vocabulary.json](references/furniture-vocabulary.json) for exact furniture categories

Pipeline:

**original raster → optional confirmed image preparation → one architectural observation (functional zones + walls + windows + doors + sliding doors + scale evidence), freeze those observations → furniture semantics/positions → raster-supported refinement + functional-zone constrained logical closure and opening audit → freeze final architecture and guiding anchors → deterministic draft → native application**

An image-quality rerun is a new complete execution from the original raster, not
another architecture pass inside one execution. Record those separately. The
browser provider uses this same architecture-first, furniture-only sequence.
Its prompts load the portable stage references directly. Direct Skill validation
does not establish the extraction quality of an external provider/model.

An explicitly requested shared-coordinate representation experiment may use
[source-point-references.md](references/source-point-references.md). It expands
losslessly to the existing architecture contract and does not change the default
prompt, normalization, closure, IDs, host matching or model-call count.

An explicitly requested spatial-context/evidence-limit experiment may also use
[spatial-context-review.md](references/spatial-context-review.md). It pairs detail
with surrounding source context and records different evidence limits without
changing geometry contracts or adding an architectural/model pass.

## Fresh validation workspace

For a benchmark rerun, start from the original raster and create a new ignored directory before generating anything:

`.plan2world-validation/runs/<run-id>/<sample-id>/`

Never use an existing run directory as reconstruction input and never write generated artifacts under `tests/fixtures`. The reconstruction-side corpus manifest contains source identity only. Do not inspect `tests/evaluation/plan2world/source-references/` until the draft and source overlay for the fresh run are generated and frozen.

Use the run directory for every generated stage artifact, for example:

- `source-architecture.json`
- `prepared/architecture-stage.json`, `prepared/decision-audit.json`
- `prepared/wall-trace.json`, `prepared/bare-house.json`
- `source-furnishing.json`
- `assembled/draft.json`
- review overlay files
- post-hoc `evaluation.json`

Historical runs belong in Git history or disposable local run directories, not active fixtures.

The original raster is immutable source evidence. Flat images use it directly.
For a photographed plane, prepare and confirm its paper/known rectangular reference
BEFORE observing architecture. Use the shared [input preparation](../../docs/image-preparation.md),
an explicit known width/height ratio and a fresh output directory; never rectify
the apartment outline, infer a page ratio or repair walls in the image. Keep the
original, recipe, reversible matrix and hashes. All later image inputs, pixels,
observations, overlays and scale calibration use that SAME frozen working image.
Below, "original/source raster pixels" means this observation input, not mixed
coordinates from the unrectified photo. Preserve preparation evidence with the
native Project using `SourceFloorPlanImage.preparation`.

Lossless local crops may be inspected for a concrete unresolved detail: record
source boxes and display scaling in working-image pixels. Fixed grids and separate
per-tile reconstruction remain opt-in/low priority; E1/E2 did not establish an
overall recognition gain. No enhancement, independent fitting or third model
observation is added. See the [experiment ledger](../../docs/observation-experiment-results.md).

## A. Observe architecture once

Use the unchanged source raster and emit `source-architecture-v1` as defined in
`architecture-pass.md`: functional zones, walls, windows, doors, sliding doors and scale evidence
together, with concise visible cues, decisions, decision bases and uncertainties.
This is an inspectable evidence record, not a private internal reasoning transcript.
Every accepted door/window/sliding door must include its source-supported host
baseline in this same observation, including the aperture interval. Observe the
baseline; do not calculate topology, IDs, host matching, units or final geometry.
All initial doors/windows extend from floor to host wall height by program policy;
height and sill height are not image extraction tasks.
Rounded outlines may use a concise polygon approximation under the stage guide;
native curves are optional, and authored Project geometry remains authoritative.

Freeze and hash `source-architecture.json` before furniture observation. This
freezes visual observations, not the final normalized geometry. Do not run final
closure before furniture anchors are available. Functional zones are collected in this same architectural observation; no third
model call is added. Furniture extraction still owns semantics/position only.

Before the furniture pass, run the shared source-consistency preflight:

`NODE_ENV=production node tooling/plan2world-architecture.mjs preflight --input "$RUN_DIR/source-architecture.json" --source original.jpg --output "$RUN_DIR/preflight"`

It checks source bounds and rejects duplicate/overlapping observed wall geometry
without altering observations or freezing a final graph. Stop this execution if
it fails; preserve the input and error. A pass does not accept opening hosts or
zone closure: those still require furniture and the final preparation below.

Separate aperture presence, extent and operation. Keep a visibly established
aperture when its operation is unclear; retain uncertain/rejected candidates in
the audit. Never invent access because a room should be reachable. Investigate
every accepted observation whose program host match fails after closure. A wrong observation requires a
new run from the original raster, never an in-place JSON repair.

Determine aperture direction from its jambs/visible interruption before reading
door leaves. Perform the source-region coverage sweep inside this same observation.
Optional visible junction points retain original-pixel evidence without model
wall IDs. `prepared/source-topology-review.json` reports residuals beyond the
normalizer's conservative snap range, using a source-pixel warning radius that
does not depend on estimated centimetres. Review candidates against the source;
neither this diagnostic nor a desire for closed rooms authorizes new geometry.
Check also corners where two partitions already meet but stop short of a third
boundary. Existing incident walls must not suppress another near-miss candidate.
After a diagnostic-only code fix, recheck a frozen stage without overwriting its
historical report:

`NODE_ENV=production node tooling/review-plan2world-topology.mjs --stage "$RUN_DIR/prepared/architecture-stage.json" --output "$RUN_DIR/posthoc-topology-review"`

This verifies unchanged Bare House geometry and writes a separate review with
the stage and diagnostic code hashes. It is not a new observation or assembly;
assembly under changed code still requires a new run when its stage differs.

## B. Observe furniture only

Use the original raster and frozen architectural observations as context. Emit only
`source-furnishing-v1` as defined in `furnishing-pass.md`.

The model observes fixed-vocabulary furniture semantics and positions only.
Size and orientation are not extraction requirements. Selectable non-colliding
markers and later replacement/snapping belong to the application. It must not
reconsider walls, openings or scale. The parser rejects architectural fields in
the furniture output. The program uses the furniture anchors before final
closure; final assembly then verifies the frozen stage and keeps its walls,
doors and windows unchanged. Newly noticed architectural concerns
belong in a separate review note, not modified generated data.

With both observations frozen, run the current closure algorithm. The current
default requires `functionalZones` in the architectural observation:

`NODE_ENV=production node tooling/plan2world-architecture.mjs prepare --input "$RUN_DIR/source-architecture.json" --furnishing "$RUN_DIR/source-furnishing.json" --source "$RUN_DIR/source.jpg" --output "$RUN_DIR/prepared"`

Pass `--source` for the default image workflow. The browser uses the same original-pixel ink algorithm. Omitting it is a geometry-only compatibility/ablation path, not raster verification. The program freezes a lossless neutral-ink mask for deterministic stage replay; it is derived evidence, not an additional model response. `window-refinement-review.json`, `normalized-window-review.json` and `raster-continuation-review.json` record proposed/accepted/rejected changes. Original architectural observations remain intact.

Centerline correction is **disabled**. `centerline-policy.json` records this
policy. Default preparation, browser generation and frozen assembly never run
centerline fitting, move junctions from a fitted line, or project apertures onto
centerline candidates. Wall colour, frame construction and stroke thickness
vary by source; candidate pixel support is not architectural validation.

If explicitly investigating raster candidates, run a separate read-only review:

`NODE_ENV=production node tooling/review-plan2world-centerlines.mjs --stage "$RUN_DIR/prepared/architecture-stage.json" --output "$RUN_DIR/centerline-diagnostic"`

`NODE_ENV=production node tooling/render-plan2world-raster.mjs --review "$RUN_DIR/centerline-diagnostic/centerline-diagnostic.json" --source "$RUN_DIR/source.jpg" --output "$RUN_DIR/centerline-diagnostic-images"`

These commands generate unapproved candidates and diagnostic maps only. They
never generate replacement wall traces/drafts or modify a stage. Do not use
candidate coordinates as assembly input or interpret candidates as accepted
corrections. They add no LLM observation. The default pipeline does not run them.
See `docs/raster-centerlines.md` for the separation from retained raster/window
refinement and native closed-face repair.

`relative-geometry.json` is independently derived from the final Bare House,
using one divisor for both axes. Source aspect ratio, the native centimetre model
and existing one-length uniform calibration remain in use with centerlines off.

`functional-zone-review.json` records initial/final native face assignments,
merged/unclosed functional zones, inserted logical passage/railing/air intervals,
bounded endpoint corrections and all rejected trials. Every accepted balcony
requires logical closure, even without furniture. Air boundaries are invisible
collision boundaries; passage hosts receive leafless openings. Their role must
not be silently changed to opaque full-height walls.

Inputs without `functionalZones` use the legacy compatibility path below. They
do not validate the new functional-zone workflow.

The program projects accepted source observations into existing contracts,
normalizes walls and evaluates bounded continuations of observed endpoints.
Furniture anchors and existing observed entrances select candidates that create
additional furnished closed regions, preserving existing anchor containment and
openings. It does not invent missing walls, move furniture or use furniture
dimensions/orientation. See `docs/furniture-guided-closure.md` in the project.

`furniture-closure-review.json` records candidates, decisions, endpoint movements
and before/after metrics. Its `normalizationInput` is program-derived, never a
replacement observation. The ordinary snap tolerance remains conservative;
candidate moves have a separate source-pixel bound. Curves, ambiguous targets,
large gaps and multi-connection closures can remain unresolved. Omitting
`--furnishing` is a compatibility/ablation path, not this default workflow.

When candidates are filtered before trial evaluation, explain the guards without
changing the frozen stage:

`NODE_ENV=production node tooling/review-plan2world-closure.mjs --stage "$RUN_DIR/prepared/architecture-stage.json" --output "$RUN_DIR/posthoc-closure-review"`

This separate read-only report records the conflicting source openings and other
pre-trial exclusions. Zero trials does not mean the furnished-space prior was
evaluated and found insufficient.

Review opening hosts and residual diagnostics, then freeze and hash the final
`architecture-stage.json` together with its guiding furniture evidence. Final
assembly requires the same furniture observation. The CLI refuses overwrites.

Assemble deterministically:

`NODE_ENV=production node tooling/plan2world-architecture.mjs assemble --stage "$RUN_DIR/prepared/architecture-stage.json" --furnishing "$RUN_DIR/source-furnishing.json" --output "$RUN_DIR/assembled"`

For a prepared photograph, add `--source working.png --input-preparation
input-preparation.json --original-image original.jpg` using the actual frozen
paths. The assembler then also writes native `project.json` with the registered
working background, original photo, transform and source-zone review. This is
the same native conversion used by desktop/browser, with no inferred entrance.

The assembler reuses the existing unit conversion, geometry, furniture catalogue,
source registration and `plan2world-draft-v1` pipeline. Legacy wall/annotation
references remain for compatibility and do not describe this direct Skill route.

## C. Validate, then hand off

Validate the assembled draft with deterministic tooling. Use source overlay only as a source-fidelity diagnostic; registration must come from the same original-pixel transform used by the assembler and must never be refitted to hide drift.

Freeze and hash the original raster, both model-evidence files, Bare House, draft
and source overlay before evaluation. Record the actual extraction executor and
entry point: a direct Skill run does not validate the browser provider's prompt or
model. Keep those scopes explicit in the report.

Inspect the assembler's opening warnings as well as geometry findings. A valid
schema, accepted registration and a zero-error geometry report do not establish
source acceptance. Explicitly review missing hosts, discarded openings, unintended
room connections and ambiguous balcony boundary construction before handoff.

The inspector also writes `indoor-connectivity.json`: approximate native-collision
sampling restricted to indoor native region polygons, excluding furniture.
Review doors' native boundary associations, regions without boundary doors,
unreached regions and regions too small to sample. Paths through exterior ground
are excluded. Bays, niches and isolated partitions can be valid; findings never
authorize automatic entrances. A sampled route is not proof of source fidelity,
and no seed/sample budget means an inconclusive diagnostic, not a failed room.

`NODE_ENV=production node tooling/inspect-plan2world-draft.mjs --draft "$RUN_DIR/assembled/draft.json" --source source.jpg --width W --height H --require-furniture-vocabulary true`

Only after the fresh draft and overlay are frozen may post-hoc evaluation read `tests/evaluation/plan2world/source-references/`.

Once the draft is accepted, stop reconstructing. The existing application owns native room derivation, 2D/3D conversion, collision, walkthrough, editing and assets.

## Failure ownership

Always fix the earliest wrong artifact:

- wrong visible wall/opening evidence → architecture observation;
- wrong split/snap/topology → normalizer/program;
- wrong furniture evidence → furniture observation;
- changed architecture after furniture assembly → program integrity check;
- wrong host match, cm conversion, opening width/position, registration, schema or IDs → assembler/program;
- wrong rooms/rendering/collision/walkthrough → downstream application.

Never repair a deterministic-stage bug by adding more LLM instructions. Never hand-edit a rejected generated artifact to make a later screenshot or test pass.
