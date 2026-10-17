# YJ215 decorated plan reconstruction review

`draft.json` is a `plan2world-draft-v1` semantic white model with one floor, 47 walls, 12 doors, 11 windows and 87 independent semantic furniture/fixture/railing blocks. `first-pass.json` preserves the initial reconstruction before any checker run. No external model/provider, saved candidate, reference annotation, or prior reconstruction was used.

## Scale and source evidence

The supplied JPEG is **1536 × 1026 px**. The legible lower **7800 mm** dimension spans approximately **x648–1068**, giving one uniform **780/420 = 1.857142857 cm/px** scale. World coordinates use `(sourcePx − (242,182)) × 780/420`; x is rightward and y downward. Six widely spread visible wall endpoints register to the original raster. These are manually picked centreline locations, not survey measurements.

Thick walls, thin partitions, openings and semantic furniture were traced from the source. Dimension lines, labels, rugs, door swing arcs and small decor were excluded. No structural curved wall was identified. Thin balcony rails were kept as independent semantic blocks rather than room walls.

## Checks actually performed

- Read the reconstruction skill, contract, repository schema and deterministic inspector implementation.
- Inspected the original image, enlarged crops of both halves, the upper facade recess, the guest bathroom and the bedroom hall.
- Viewed a full wall/opening overlay and a full furniture footprint overlay against the source. This is a manual visual review, not an independent accuracy benchmark.
- Ran the repository CLI on the preserved first pass, then on `draft.json`, with the exact original raster and its dimensions. Both runs exited **0**, with **0 geometry errors**, **0 warnings**, and **registration accepted**. The final import derives **9 native rooms** and retains all **87 furniture blocks**.
- Supplemental checks passed for unique IDs, valid wall references, positive semantic dimensions, opening spans wholly within their walls, and absence of explicit `rooms`. Minimum opening endpoint clearance is about **6.5 cm**. Registration residual from rounding is below **0.000003 px**; this measures transform consistency only.

Reports are under `inspection/first-pass/`, `inspection/final/` and `inspection/manual-audit.json`. Source-containing crops/overlays are internal inspection evidence and should not be redistributed as deliverables without permission.

## Revision and uncertainty

The first pass included an inferred kitchen-to-utility balcony door. Visual review showed a continuous dark wall there, so that unsupported opening was removed in `draft.json`. No structural error correction was required by the checker.

The guest bathroom's west-side access remains an inference with **0.4 confidence**; its exact location should be checked in an architectural plan. The shallow guest north bay is traceable, but the pale strip above the adjoining bathroom is treated as an exterior ledge/void. South bedroom and bathroom bay projections are represented as sill/bench occupancy blocks rather than asserted full-height room extensions; their glazing returns remain uncertain.

Balcony rails do not enclose native rooms, so this draft does not guarantee generated exterior balcony slabs. Wide balcony and kitchen openings retain approximate source spans but use ordinary default doors; leaf count, sliding configuration and style require user selection. Window sill/height are deliberately omitted: floor-to-ceiling fixed glass follows the white-model profile and is a presentation assumption. Wall/furniture heights, fixture identities in small decorated areas and upholstery footprints are estimates. Counter fixtures intentionally overlap their supporting counters.

Passing parsing, registration and geometry checks establishes structural usability, **not source-image accuracy**. The decorated marketing raster limits precise wall, aperture and furniture measurements.
