# Observation workflow experiments

The runtime migration is merged through PR #62. Observation experiments start
from main commit `a2b5dd6` on local branch `observation-v2`. They remain separate
from the frozen five-image baseline and the native-Project runtime regression.
Do not push or merge these experiments without a further user request.

[Main-level CI](https://github.com/6jingyong/plan2world/actions/runs/40077540331)
passed on that merge: core/unit/build/audit, Linux and native Windows Godot,
1,302 browser cases across three engines (one Firefox case passed on the configured
retry), and six benchmarks. Windows Forward+ hardware/manual acceptance remains
separate.

The reference is [img2threejs](https://github.com/img2threejs/img2threejs/tree/954cd5845e90efd045694bab725d68a9863c20e0):
explicit source-region coverage, inspectable evidence views and observations
that reach real structured outputs. Its current pipeline also uses a deterministic
factory generator from a model-authored spec; it is not simply a request for the
model to hand-write a Three.js scene. Plan2World already has its own equivalent
ownership boundary through observations, native Project and runtime compilation.
Do not adopt its sculpt-spec/Three.js factory as another canonical representation.

## Step 1: original-pixel evidence views

This first experiment changes only how a source can be inspected. It does not
change the Skill prompt, observation schema, architecture preparation, geometry,
host tolerances or runtime compiler. No AI call is made by the view generator.

```sh
node tooling/plan2world-source-views.mjs \
  --source original.jpg --output NEW_DIRECTORY --grid 3x3 --overlap 32
```

The tool reuses the local original-raster decoder, copies RGBA pixel rows and
writes lossless PNGs. `overview.png` preserves the full source context. Nine grid
views include a 32px source overlap for features crossing cell boundaries. The
manifest has source-file/decoded-pixel hashes, deterministic view IDs, image
hashes, `sourceBox`, disjoint `coreBox` and intrinsic pixel scale 1. Boxes use
`[left, top, right, bottom)`. Nothing is enhanced, thresholded, rotated, fitted or
resized. The output must be a fresh directory; partial runs are not overwritten.

These are views, not independent coordinate systems. Observations still use
original-image pixels. Repeated views of a shared stroke do not authorize
repeated walls. The existing `sourceView` evidence field can reference the crop;
it does not assign a wall ID or authorize a host match.

Acceptance checks source orientation, exact one-time core coverage, overlap and
edge clipping, decoded PNG pixel equality, stable manifests/PNG bytes, unchanged
source hashes and overwrite refusal. Generate and inspect views for the five
original uploads in a new ignored run. This verifies evidence preparation only;
it does not establish an improvement in extraction or five-image pass rate.

## Current decision after the fresh observation trial

Keep the view generator opt-in. An initial five-image direct-Skill historical
comparison found local gains and regressions, with no increase in strict
completion. Extra source views did not reliably prevent repeated shared walls,
contradictory door/partition observations or endpoint inconsistencies. This was
not a blinded/provider evaluation; do not promote the workflow on that evidence.
The next isolated variable is a global feature inventory mapped to the existing
wall/opening/zone records, with consistency findings preserved rather than
silently repaired. Runtime and reconstruction algorithms remain unchanged.

The [global inventory pilot](observation-inventory-pilot.md) keeps that variable
inside the existing architectural observation. Its first selected office-plan
execution recovered strict generation from the previous overlap failure, with
all 39 planned entries linked to actual observations. However, indoor collision
sampling reached only 5/8 regions (the earlier baseline reached 8/8), and source
uncertainties and perimeter omissions remain. Complete bookkeeping does not
establish complete source coverage. Keep this procedure opt-in; this one known,
non-blind case does not establish a five-image or general quality improvement.
The office image's ambiguous concealed doors are excluded from recognition-quality
scoring by user instruction; keep the original uncertainty and connectivity
diagnostics without treating them alone as a failure of the method.

The diagonal-apartment trial also linked every planned entry (162/162) and
resolved all 47 accepted apertures through strict assembly. It did not establish
an overall improvement: only 10/24 functional zones were supported, native room
analysis produced a non-simple outer ring, and actual Godot grounding failed
where the untriangulatable floor had no compiled collider. Preserve this failed
execution. Reference completeness and successful export do not prove source
fidelity or a runnable floor.

## What transfers from img2threejs

The inspected upstream main is still `954cd5845e90efd045694bab725d68a9863c20e0`.
Its [detail-inventory tool](https://github.com/img2threejs/img2threejs/blob/954cd5845e90efd045694bab725d68a9863c20e0/forge/stage1_intake/build_detail_inventory.py)
prepares views and unfilled stubs; it explicitly does not detect or score visual
features. The [inventory contract](https://github.com/img2threejs/img2threejs/blob/954cd5845e90efd045694bab725d68a9863c20e0/grimoire/intake/detail_inventory.md)
requires observed details to map to actual output features. That traceability,
stage ownership, explicit evidence gaps, and diagnosing the responsible artifact
are useful engineering ideas. Current local trials have not proved an extraction
gain from extra views or a larger ledger.

Feature recognition, cabinet-versus-wall classification, jamb direction, curve
controls and scale-anchor correspondence still depend on visual observation.
Procedural part selection, occluded shape and material inference in upstream
also depend on model capability. Schema/generator checks do not establish those
judgments, and self-reported confidence is not calibrated accuracy.

Do not transfer minimum feature quotas, generic subjective fidelity scores as
acceptance gates, camera/image fitting that conceals plan-coordinate errors,
repeated visual geometry correction, or sculpting/material/rig subsystems into
floor-plan extraction. Upstream's own [review guide](https://github.com/img2threejs/img2threejs/blob/954cd5845e90efd045694bab725d68a9863c20e0/grimoire/review/self_correction.md)
warns that passing image metrics can miss wrong geometry. Multi-angle review is
useful for rendering, but cannot establish unseen source construction.

Candidate observation changes must be tested separately: reduce repetitive ledger
output to shared/ambiguous features, and require explicitly observed edge kinds
in experimental serializers instead of defaulting every accepted-zone edge to
`wall`. Do not repair frozen observations, fill a missing floor or move spawn in
Godot. Native geometry validation and compiler acceptance own program failures;
keep those fixes separate from the original observation-method comparison.

The floor-acceptance change is a separate program fix: shared runtime export now
blocks an untriangulatable room surface or invalid/unresolved explicit ground/
floor-opening boundary. It preserves native editing and fails before artifact
output. The frozen diagonal trial remains failed and unchanged; post-hoc compiler
rejection is not an observation-method improvement. Explicit per-edge observation
and a shorter inventory remain separate, untested candidate changes.

## Subsequent steps, one variable at a time

1. Supply the verified views during the existing single architectural observation
   and keep the source-only coverage record inspectable. Separate accepted,
   uncertain and rejected observations; do not invent features to fill a quota.
2. Measure raw observation coverage and consistency separately from deterministic
   normalization/closure. Trace observed details into actual existing wall,
   opening, junction and functional-zone fields rather than adding prose-only
   claims. Decide whether a small additional evidence contract is needed only
   after testing the existing fields.
3. Add explicit source-suitability and scale-evidence review if the evidence shows
   it is useful. A program must not silently replace a bad observed scale or
   deduplicate repeated observations to claim success.

Each image-quality trial begins again from the original raster in a fresh ignored
directory. Freeze architecture before furniture and freeze all generated
artifacts before consulting human references or reviewing outcomes. Preserve
failed runs. Keep later variables out of the first test; compare each step before
adding the next.
