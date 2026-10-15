# Real floor-plan benchmark fixtures

These fixtures are intentionally based on real, externally published floor plans rather than synthetic test geometry.

## `wikimedia-two-bedroom.json`

Source image: `https://commons.wikimedia.org/wiki/File:Floor_plan_01.jpg`

Original raster: 535 × 526 JPEG. Caption: “Proposed two bedroom”. Author: Bajoga2021. Published on Wikimedia Commons under CC BY-SA 4.0.

The repository does **not** redistribute the source raster. The JSON fixture is a hand-authored Plan2World baseline derived from the visible plan and its printed dimensions. It exists to separate two questions:

- **A / deterministic pipeline:** can a plausible real-world `plan2world-draft-v1` pass parsing, geometry health checks, room detection, and native-project conversion?
- **B / vision quality:** can the configured vision model produce a draft close to this baseline from the original image?

The baseline is not architectural ground truth. Small/blurred door-window widths and the upper service-zone partitions are explicitly approximate. The important structural invariants for the first sample are an approximately 6.90 m × 12.00 m overall extent, the stepped right-side outline, 18 wall segments, 10 doors/openings, 7 windows, and 11 detected enclosed regions from the current wall graph.
