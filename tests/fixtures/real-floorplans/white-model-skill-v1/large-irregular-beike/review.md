# Large irregular Beike plan: reconstruction review

This is an editable `plan2world-draft-v1` semantic white-model draft reconstructed manually from the original 1536 × 1146 image. It contains one floor, 83 connected wall segments, 18 wall-attached doors, 15 wall-attached windows and 38 independent semantic furniture/fixture blocks. No `rooms` polygons are supplied. The two large blank exterior voids are preserved.

The scale uses the legible bottom dimension **7914 mm** across the central living-room span. Approximate source wall centrelines at x=574 and x=886 give 312 pixels, hence **2.5365384615 cm/pixel**. Every coordinate and footprint uses this uniform scale with source origin (206,72). Six spread-out existing wall endpoints register the draft to the original raster. The dimension endpoints and some wall centres remain uncertain by several pixels; this is not a survey.

## Checks actually performed

- Read the skill and contract, inspected the original image, and enlarged source crops. No saved reconstruction candidates, corpus annotations, prior agent drafts or external model/provider were used.
- Saved `first-pass.json` before running the repository checker. The first pass passed with zero geometry errors and accepted source registration; two 22.8 cm short-wall warnings were reported.
- Compared the draft overlay against the raster across the upper cluster, left bedrooms/bathrooms, central entry/living area, right wing and southern balcony boundaries. Magenta is wall centreline, green is door span, blue is window span, and orange is a semantic furniture footprint in `inspection/overlay.png`.
- Enlarged review revealed the thin-line bathroom-A opening. Added door `d18` to the final draft without changing `first-pass.json`.
- Ran `NODE_ENV=production node tooling/inspect-plan2world-draft.mjs` on the final draft with the original image and exact raster dimensions. **Exit 0; registration accepted; 0 geometry errors; 2 warnings; native conversion produced 18 derived rooms and retained all 38 furniture blocks.** Findings are in `inspection/final/inspection.json`; native project and reconstruction trace are alongside it.
- The two remaining warnings are `n34` and `i18b`, short vertical segments at the stepped left bathroom pier. They are retained as a simplified trace of visible offset geometry rather than removed solely to clear a warning.

These checks establish parsing, references, opening feasibility and registration consistency. They do **not** certify source-image accuracy. No interactive editor or 3D walkthrough review was performed.

## Main uncertainties and presentation assumptions

- Blue branding obscures the central entry and bathroom D; its doorway and one fixture have reduced confidence. The lower-right copyright obscures the large-room southern boundary; possible glazing there is omitted.
- The kitchen/dining interruption may be internal glazing or an operable panel. The long thin interruption in the multipurpose-room west boundary and the shorter balcony-side interruption are treated as internal glazing, with reduced confidence.
- Balcony thin outer boundaries are represented by editable low barriers at an assumed 110 cm height. Their railing/parapet construction and actual height are unknown.
- Default walls are 280 cm high, with approximate 20/12 cm exterior/interior thickness. All window types/heights/sills are omitted so the white-model profile uses floor-to-ceiling fixed glass. This is a presentation assumption. Door styling, broad opening leaf counts and furniture heights are also defaults or estimates.
- Small shower-screen lines, uncertain fittings, rugs, decor, text and swing arcs are omitted. The thick left bathroom pier is simplified. Furniture is rectangular occupancy geometry; sink/cooktop overlap with the kitchen counter is intentional.
