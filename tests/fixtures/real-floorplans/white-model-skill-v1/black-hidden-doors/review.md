# Reconstruction review

Draft: `draft.json` (`plan2world-draft-v1`, `semantic-white-model`). The independently traced first pass is preserved in `first-pass.json`. The final draft has 1 floor, 27 wall segments, 10 wall-attached doors, 1 window, and 12 independent semantic furniture/fixture blocks. No rooms were supplied; conversion derives 8 enclosed rooms. The fire-escape corridor remains open on the left as drawn.

Scale is estimated, not measured: the north-left entrance is approximately 96 px wide and assumed to be 90 cm, giving 0.9375 cm/px. The exact source raster is 1199 × 1536. Every element uses world = (source − (208,178)) × 0.9375. Six widely spread visible wall-centreline endpoints anchor the same transform. Horizontal extent including the open corridor boundary is about 758.44 × 1152.19 cm under this assumption.

## Checks performed

- Read the reconstruction skill and contract; inspected the original raster and enlarged upper, middle and lower crops. Did not use other drafts, reference annotations, prior reconstruction results, or external model providers.
- Saved the first pass before running the existing repository CLI. It returned 0 geometry errors, 0 warnings, accepted registration, and 8 derived rooms.
- Inspected a source overlay of every traced wall, opening and furniture footprint. Reduced/repositioned the lower-central chair footprint in the final draft; no structural correction was needed. Inspected the final private-suite overlay after this change.
- Explicit checks passed for unique IDs, referenced walls, positive furniture dimensions, complete opening spans within their walls, and all six anchor transforms.
- Ran `NODE_ENV=production node tooling/inspect-plan2world-draft.mjs` again on `draft.json`, using the original source and dimensions. Final result: 0 geometry errors, 0 geometry warnings, registration accepted. Results and native conversion are in `inspection/final/`.
- The Python `jsonschema` package was unavailable, so a separate formal JSON Schema validation was not performed. The application's own parser and deterministic geometry/conversion checks did run successfully.

## Remaining uncertainty

The right concealed/sliding connection is inferred from the label and narrow multi-line detail; its approximately 148 px span is uncertain. The thin line beside the left wardrobe is interpreted as a cabinet panel rather than an additional partition. The lower-right perimeter's small offsets are simplified into the common lower wall; their exact construction needs review. The thin horizontal edge above the bathtub is treated as a fixture/niche edge, not an inaccessible extra room.

The round bed, circular lower-central feature and chair are rectangular editable semantic blocks. Bedside symbols and the circular feature have uncertain identities. Curved headboard trim, cabinet detail and small plumbing details are omitted. All heights are defaults or estimates. The window uses floor-to-ceiling fixed glass only as a white-model presentation assumption; the source establishes neither glazing height nor style. Concealed/sliding doors are initially ordinary doors for editing.

Passing these checks establishes structural validity and internally consistent registration. It does not certify source-image accuracy or physical dimensions. Source-bearing overlays/crops are local inspection evidence, not deliverables for redistribution.
