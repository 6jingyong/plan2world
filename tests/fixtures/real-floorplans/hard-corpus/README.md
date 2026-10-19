# Hard real-floor-plan benchmark corpus

This corpus tracks difficult real floor-plan rasters supplied by the project owner for reconstruction benchmarking.

The source rasters are **not redistributed in this public repository** because their reuse rights are not established. `manifest.json` records the exact pixel dimensions and SHA-256 of each owner-provided raster so a local copy can be verified without publishing it.

## Source-space references

Human benchmark truth uses `plan2world-source-reference-v1`: normalized coordinates directly on the source raster rather than a hand-authored centimetre-scale Plan2World draft. This avoids turning guessed scale, origin, room topology, or obsolete model output into supposed ground truth.

Historical model drafts are intentionally not stored in the active corpus. If an old run is needed for archaeology, use Git history instead of feeding it into a fresh reconstruction run.

Each wall/door/window layer declares annotation coverage:

- `complete`: the layer is intended to be exhaustive, so precision, recall and F1 are meaningful.
- `partial`: only selected high-confidence landmarks are annotated. The scorer reports reference-to-candidate recall/error, but **must not** report candidate precision or F1 because unannotated candidate geometry is not evidence of a false positive.
- `none`: the category is not scored.

References are added incrementally and remain auditable against the exact raster hash. Door/window and room-count truth should be deferred rather than guessed when the source is ambiguous.

## Current sample roles

- `decorated-yj215`: semantic separation under furniture, textures, balconies and dense dimensions.
- `one-hyde-park`: diagonal/large-scale topology and over-segmentation pressure.
- `curved-lianjia`: dominant curved exterior geometry.
- `black-hidden-doors`: sparse dark drawing, unconventional door semantics and fixture-heavy regions.
- `large-irregular-beike`: large irregular open plan with multiple wings and large empty/void-like areas.

## Fresh-run rule

A reconstruction validation must start from the owner-provided raster whose dimensions and SHA-256 match `manifest.json`. Do not seed a run with an older candidate draft, wall IDs, centimetre coordinates, or reconstructed geometry. The active pipeline is source evidence → deterministic normalization → source annotation evidence → deterministic assembly.
