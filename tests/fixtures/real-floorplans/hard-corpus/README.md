# Hard real-floor-plan benchmark corpus

This corpus tracks difficult real floor-plan rasters supplied by the project owner for reconstruction benchmarking.

The source rasters are **not redistributed in this public repository** because their reuse rights are not established. `manifest.json` records the exact pixel dimensions and SHA-256 of each owner-provided raster so a local copy can be verified without publishing it.

## Historical blind candidates

The first four `*-gpt56-sol-historical.json` files are byte-for-byte GPT-5.6 Sol first-pass reconstructions recovered from the older `test/hard-floorplan-blind-bench-v1` branch. They predate the current source-space scorecard and have not been manually corrected. Preserving those mistakes is intentional: they are regression candidates, not reference truth.

The fifth sample, `large-irregular-beike`, was added later and has no historical blind candidate yet.

## Source-space references

Human benchmark truth uses `plan2world-source-reference-v1`: normalized coordinates directly on the source raster rather than a second hand-authored centimetre-scale Plan2World draft. This avoids turning guessed scale, origin, or room topology into supposed ground truth.

Each wall/door/window layer declares annotation coverage:

- `complete`: the layer is intended to be exhaustive, so precision, recall and F1 are meaningful.
- `partial`: only selected high-confidence landmarks are annotated. The scorer reports reference-to-candidate recall/error, but **must not** report candidate precision or F1 because unannotated candidate geometry is not evidence of a false positive.
- `none`: the category is not scored.

References are added incrementally and remain auditable against the exact raster hash. The first reference is deliberately partial: `black-hidden-doors-reference.json` contains only high-confidence wall-centerline landmarks. Door/window and room-count truth are deferred rather than guessed.

## Current sample roles

- `decorated-yj215`: semantic separation under furniture, textures, balconies and dense dimensions.
- `one-hyde-park`: diagonal/large-scale topology and over-segmentation pressure.
- `curved-lianjia`: dominant curved exterior geometry.
- `black-hidden-doors`: sparse dark drawing, unconventional door semantics and fixture-heavy regions.
- `large-irregular-beike`: large irregular open plan with multiple wings and large empty/void-like areas.
