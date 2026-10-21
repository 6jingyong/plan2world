# Furniture-guided local closure

For raster-enabled browser/Skill runs, deterministic window/pier refinement and pixel-supported continuation selection also run before final freeze. See [raster-wall-continuation.md](raster-wall-continuation.md); pass the original image with `prepare --source`. This adds no visual observation and preserves the raw architecture/furniture records.

Furniture semantics and source-pixel centres are collected before final wall
closure. The wall/opening observation is immutable; no extra wall-recognition
pass, furniture sizes or orientations are needed. Existing visual prompts are
unchanged. The runtime freezes final geometry after program selection, and the
same guiding furniture evidence is required during final assembly.

The program starts with the existing 3px normalization. It considers nearby
straight endpoint continuations to existing observed wall segments. It moves
all source endpoints already sharing that junction together. Movement is bounded
against original observations, including the result of the final normalizer,
by the lesser of the source near-miss radius and three times the ordinary snap
tolerance. This is a local candidate budget, not a global snap-range increase.

Candidates are evaluated using native room derivation and opening host matching:

- additional furnished enclosed regions must have an existing observed doorway;
- previously enclosed furniture anchors remain enclosed;
- matched opening count is preserved and no new furnished entrance-less region
  is introduced;
- a partition may not land in the interior of an observed aperture;
- no new walls, moved furniture, collapsed or reversed source walls;
- equally supported competing nearby boundary targets remain ambiguous.

Selection favours additional furnished regions with entrances, then anchor
coverage, then the smallest endpoint movement. Existing native geometry is used
for trial evaluations; no parallel persistent scene model is created. Trials
and accepted moves are saved in `furniture-closure-review.json`; the original
`wall-trace.json` and source evidence are unchanged. `normalizationInput` in the
review is explicitly program-derived input, not a replacement source observation.

This first implementation is greedy, with at most 128 trials and 12 accepted
connections. It does not invent complete missing partitions, adjust curves,
infer one room per furniture item/bed, resolve all ambiguous targets or solve
closures that only improve after several simultaneous connections. The result
depends on native room derivation and the supplied scale; it is not an accuracy
certificate. Outdoor placement and wrong anchors need source review.

Run with both independent source observations available:

```bash
NODE_ENV=production node tooling/plan2world-architecture.mjs prepare \
  --input source-architecture.json --furnishing source-furnishing.json \
  --source-width W --source-height H --output new-run/prepared
NODE_ENV=production node tooling/plan2world-architecture.mjs assemble \
  --stage new-run/prepared/architecture-stage.json \
  --furnishing source-furnishing.json --output new-run/assembled
```

Omitting `--furnishing` retains the compatibility path for controlled algorithm
comparisons. Replaying identical frozen source observations into a NEW directory
is a deterministic algorithm comparison, not a fresh visual-extraction benchmark.
Never overwrite a historical stage, standardized draft, overlay or 3D result.

To explain why no candidate reached native trial evaluation, use the separate
read-only guard review. It verifies that current code reproduces the frozen
stage, then records excluded endpoint/target pairs and the source apertures
that blocked them. It does not change stage serialization or candidate selection:

```bash
NODE_ENV=production node tooling/review-plan2world-closure.mjs \
  --stage new-run/prepared/architecture-stage.json \
  --output new-run/posthoc-closure-review
```

`trialCount: 0` alone is inconclusive: there may be no nearby continuation, a
curved junction, an excessive move or a conflict with an observed door/window.
Those conditions require different follow-up. Conflicting observations and
complete missing partitions are not resolved by increasing furniture rewards.
