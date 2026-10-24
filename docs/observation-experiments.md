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
that reach real structured outputs. Its AI-authored Three.js scene, minimum
detail quotas, confidence scores and repeated geometry-correction loop do not
replace Plan2World's existing deterministic ownership.

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
