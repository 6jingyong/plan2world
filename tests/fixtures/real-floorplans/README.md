# Real floor-plan benchmark fixtures

These fixtures are intentionally based on real, externally published floor plans rather than synthetic test geometry.

## `wikimedia-two-bedroom.json`

Source image: `https://commons.wikimedia.org/wiki/File:Floor_plan_01.jpg`

Original raster: 535 × 526 JPEG. Caption: “Proposed two bedroom”. Author: Bajoga2021. Published on Wikimedia Commons under CC BY-SA 4.0.

`wikimedia-two-bedroom-source.jpg` is an unchanged copy of that existing sample's source raster, credited to Bajoga2021 and licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Source: [Floor plan 01.jpg](https://commons.wikimedia.org/wiki/File:Floor_plan_01.jpg). Its 135,717 bytes have SHA-256 `14e965e54b8d2e9788c967eb4eed8b6dde46866717167f3698c51941aa51a5e1`. The JPEG retains that license; it is not covered by the application's MIT license.

The JSON fixture is a hand-authored Plan2World baseline derived from the visible plan and its printed dimensions. It exists to separate two questions:

- **A / deterministic pipeline:** can a plausible real-world `plan2world-draft-v1` pass parsing, geometry health checks, room detection, and native-project conversion?
- **B / vision quality:** can the configured vision model produce a draft close to this baseline from the original image?

The baseline is not architectural ground truth. Small/blurred door-window widths and the upper service-zone partitions are explicitly approximate. The important structural invariants for the first sample are an approximately 6.90 m × 12.00 m overall extent, the stepped right-side outline, 18 wall segments, 10 doors/openings, 7 windows, and 11 detected enclosed regions from the current wall graph.

`tests/browser/real-plan-correction-flow.spec.ts` reuses this same image and baseline for a product acceptance replay. A local test endpoint returns the baseline with an oversized door and displaced top corner injected in memory. It checks original-image upload, Review, precise corrections, room recovery, unchanged underlay registration, save/reload, architectural cut and keyboard walkthrough. It does not call a live model, compare providers, add corpus samples, or qualify reconstruction accuracy against architectural ground truth.

## Source-space quality scorecard

`scoreReconstructionAgainstReference` compares a candidate and reference after projecting both back into the **same original source-image coordinate system**. Both drafts must provide valid explicit `sourceRegistration`; evaluation deliberately refuses the wall-bounds fallback used by the editor because independently fitting a bad reconstruction to the raster can hide structural error.

The first scorecard reports orthogonal evidence instead of a made-up composite score:

- length-weighted wall precision / recall / F1 within an image-scaled tolerance;
- reference→candidate and candidate→reference mean and P95 wall distance in source pixels;
- one-to-one door and window position precision / recall / F1;
- detected room-count delta and candidate deterministic error/warning counts.

We intentionally do **not** define a pass/fail total score yet. Thresholds and weights should be fitted only after the real-plan corpus contains enough varied plans to reveal what good and bad reconstructions actually look like.

## `wikimedia-two-bedroom-gpt56-sol-historical.json`

This is a historical GPT-5.6 Sol reconstruction recovered from an earlier Plan2World benchmark experiment. It is **not blind evaluation data** and must not be treated as ground truth or as an acceptance threshold. It is retained because it is a useful regression candidate: its overall wall graph is close to the reference while it misses one reference door/opening and one reference window, so a useful scorecard must expose those differences rather than rewarding similar wall counts alone.
