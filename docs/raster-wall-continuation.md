# Deterministic source-raster refinement

The existing architecture observation and furniture observation remain the only
two model stages. This deterministic program adds **zero LLM calls**. Its pure
TypeScript module consumes original RGBA pixels, frozen wall observations and
furniture anchors. It has no API/provider dependencies and can operate on browser
Canvas ImageData. The CLI uses local Chromium only to decode JPEG/PNG/WebP.

The browser reconstruction pipeline enables it using original Canvas pixels. The
portable Skill/CLI enables it with `prepare --source original.jpg`. Geometry-only
callers without pixels remain supported but do not exercise this algorithm.
Neither visual prompt nor observation schema changes. The stage freezes a
lossless run-length encoded neutral-ink mask, allowing assembly to replay the
whole deterministic calculation without another visual observation. CLI
provenance separately records the original image and decoded RGBA SHA-256.

## Algorithm

1. Determine light/dark background polarity from the source border. Keep neutral,
   high-contrast pixels as candidate ink; colour alone never establishes a wall.
2. Measure the stroke across the end portion of an already observed straight
   wall. Require a sufficiently thick, continuous reference stroke.
3. Cast bounded rays from that endpoint, within 12 degrees of its direction.
   Stop at the first observed straight boundary. Extension length is bounded by
   20% of the shorter original raster dimension, independent of estimated cm.
4. Sample perpendicular sections along each candidate. Require at least 90%
   continuous support, bounded gaps, comparable stroke width and small offsets.
   Ignore thick junction pixels at the two ends when measuring continuity.
5. Choose the best-supported image stroke before semantic guards. Do not switch
   to a worse angle to skirt an observed door/window or furniture anchor. Exclude
   existing/duplicate wall coverage, aperture conflicts and ambiguous targets.
6. Suggestions remain proposals. The CLI evaluates them using the existing
   normalizer, opening matcher, assembler and native room derivation. It selects
   only proposals that add furnished regions with existing entrances, preserve
   enclosed anchors/opening matches, and do not increase overlapping furniture
   memberships or furnished regions without entrances.

The program appends selected, pixel-supported continuation segments to a NEW
program-derived normalization input. Source observations and previously generated
JSON/models are never overwritten. Existing normalization owns intersections and
splitting; no competing scene graph or manually authored model is introduced.

## Window consistency

The opening resolver keeps its ordinary 3 px tolerance. A unique straight window
may use at most sqrt(2) additional pixels for independent pixel-grid rounding,
with direction and finite-host checks. Multiple nearby hosts remain ambiguous;
explicit caller tolerances disable this fallback. This does not extend a wall.

Before closure, near-endpoint windows can be shortened at an observed partition
continuation only if five transverse original pixels establish a solid pier and
a bounded clear edge. Doors are never shortened. Every decision and pixel sample
is recorded; ambiguous, mid-span and unsupported conflicts stay unresolved.
Bounds are twice the local closure limit plus sqrt(2) px, and at most 20% of the
window span. Original observations remain unchanged. Thick piers offset from a
zero-width host can still prevent a safe refinement; the algorithm does not
force closure by deleting the window.

After normalization, the program also checks windows that straddle a T-junction
near one approximate jamb. At least 80% of the interval must fit one finite host;
a connected solid-ink component must reach from an observed incident branch to
that host corridor within a bounded local neighborhood. This handles thick wall
piers offset from a zero-width baseline. Only one unique host is allowed, at most
20% of the span can be trimmed, and the endpoint moves at most the local 6–9 px
limit plus 3 px pier clearance and sqrt(2) px projection allowance.
`normalized-window-review.json` records raw/projected endpoints, the native node,
movement and actual source-pixel support. Doors, mid-span conflicts and ambiguous
choices are not repaired. This happens before final architecture freeze.

## Run

Install the project's existing Playwright Chromium decoder if necessary:

```bash
npx playwright install chromium
NODE_ENV=production node tooling/plan2world-architecture.mjs prepare \
  --input new-run/source-architecture.json --furnishing new-run/source-furnishing.json \
  --source new-run/source.jpg --output new-run/prepared

# Optional controlled comparison, never a fresh extraction benchmark:
NODE_ENV=production node tooling/review-plan2world-raster.mjs \
  --stage frozen-run/prepared/architecture-stage.json \
  --source frozen-run/source.jpg --output new-experiment/algorithm
```

If Chromium has a custom installation location, set `PLAYWRIGHT_BROWSERS_PATH`.
All output files use exclusive creation. Replaying frozen observations is a
controlled algorithm comparison, **not a fresh extraction-quality benchmark**.

Outputs include every reference-stroke measurement and candidate rejection,
native trial metrics, program-derived normalization input, experimental draft
and hashes. `normalAssemblyCertified` remains false: this tool does not resolve
all source observations or certify the case. A previously unmatched opening is
not silently removed from the source evidence or declared fixed.

## Limits

This first experiment recovers continuations of observed straight neutral
strokes. It cannot recover an isolated wall with no seed, follow curved walls,
relocate openings or determine semantic wall identity from pixels alone. Thick
cabinet outlines, annotations and poor scans can still be ambiguous; walls under
three pixels wide or with large gaps can be missed. Parameters have not been
validated across the five-image corpus. Native region gain is a trial condition,
not an independent source-accuracy verdict; native overlaps remain a known issue.

