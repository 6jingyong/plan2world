# Reconstruction stages and fault ownership

Validate the earliest incorrect artifact before changing a downstream stage.
Keep the original image and the emitted JSON unchanged during review. A corrected
example is not evidence that the Skill will reconstruct the next image correctly.

| Step | Output / acceptance | Owner of a failure |
| --- | --- | --- |
| 1. Source coordinates and scale | Original dimensions, crop-to-source mapping, one scale basis | Extraction coordinate handling; scripts can calculate transforms |
| 2. Outer wall outline | Actual wall centrelines, including curves, recesses and bay projections; no bounding-box substitution | Skill tracing establishes architectural context before object recognition |
| 3. Object eligibility and fixed labels | Recognizable furniture/appliance/fixture first, exact permitted ID and approximate centre second; one regional omission/deduplication pass | Skill distinguishes architectural features from real objects; parser rejects unlisted labels |
| 4. All shared walls and closure | Reuse outer walls, add interior walls, join corners/T-junctions; preserve source-supported closed spaces and open circulation | Tracing/topology; geometry checks do not authorize invented partitions |
| 5. Hosted openings | Door/window type, centre and width on a source-supported host | Skill opening recognition/association |
| 6. Standard JSON | One uniform conversion to cm; separate furniture/walls/doors/windows arrays, valid IDs and dimensions | Serialization/contract validation; use the existing parser/checker |
| 7. SVG source review | Original beside `plan.svg`, optionally `overlay.svg`; inspect walls/openings and furniture type/approximate position | Compare source → JSON first, then fixed JSON → SVG; fix the first incorrect stage |
| 8. Native geometry / 3D conversion | A fixed, reviewed JSON creates the expected walls and apertures | Converter only when input JSON is already correct |
| 9. Viewing and navigation | Correct camera, view switching, selection/picking and movement on fixed geometry | Viewer/input/collision implementation, after excluding incorrect input geometry |
| 10. Furniture editing | User chooses style, size, direction and precise placement on the same native item | Editor commands/state binding; do not rebuild architecture to repair selection |

Test harness failures form a separate category. For example, the #47 walkthrough
clock takeover race was fixed in the test, not in the geometry generator.

## Local responses to observed failure patterns

| Observed pattern | Limited response | Evidence needed before expanding work |
| --- | --- | --- |
| Bay/ledge promoted into furniture | Trace outer walls first; confirm a real object before choosing a fixed label; omit/disclose unresolved objects instead of unknown furniture | Original region + unchanged JSON entry; a valid category alone cannot establish object presence |
| Missed/duplicate furniture | Inventory plus one regional omission/deduplication pass (#49); SVG shows each ID and position | A source object missing or duplicated in JSON; first exclude SVG omission |
| Kitchen sliding access called a fixed window; shower access omitted | Sweep each wall for openings and use panel/access evidence; review door/window SVG layers | A specific source span and the mismatched JSON entry; do not widen or invent access for navigation |
| Different coordinates used for crops, geometry or anchors | One transform, numeric checks and source-registered SVG | A specific corresponding pixel/JSON point mismatch |
| Open balcony ground cannot be expressed by closed walls | Existing optional `floorAreas` (#46); draw explicit boundaries only | Source-visible perimeter; no bounding-box floor inference |
| Furniture direction, dimensions or fine placement differ from the source | Leave these to user editing; omitted dimensions use the existing 50 cm placeholder cube | Not an extraction failure; do not patch source JSON to improve a screenshot or navigation |
| Suspicious 3D floor screenshot | Preserve input and isolate a repeatable rendering case | Correct SVG/JSON first, then a before/after renderer test; no speculative geometry patch |

The goal is a reusable conversion Skill and program. If JSON misrepresents the
source, revise the Skill/extraction script and regenerate from the unchanged
original. A hand-corrected candidate is not a Skill improvement. If JSON is
correct but SVG is wrong, preserve that input and fix/test the SVG renderer.
Apply the same isolation to 3D conversion, viewing and editing. Parser/unit tests
validate programs and contracts; they do not establish five-image extraction
accuracy. Review furniture omissions, types and broad locations, not chair angles
or pixel-perfect footprints.

## JSON → SVG review

See [the synthetic example](../examples/plan2world-white-model-review.svg), generated
from `examples/plan2world-white-model.example.json` with the command below.

```sh
node tooling/render-plan2world-svg.mjs --draft draft.json --output review
node tooling/render-plan2world-svg.mjs --draft draft.json --output review --source source.jpg --width 1536 --height 1026
```

The first command writes `plan.svg`. The second also writes `overlay.svg`, with
the original raster embedded privately. Use its actual original width/height.
`--floor floor-id` selects another floor. Without it, the registered floor is
selected, or the first floor when registration is absent.
Labels are shown on the plain plan and hidden on the overlay to keep the source
readable; `--labels true` or `--labels false` overrides both outputs.

SVG groups are `walls` (black centrelines), `furniture` (purple position markers,
or rotated footprints when explicit width/depth are supplied),
`doors` (orange spans), `windows` (blue spans), `floor-areas` (cyan explicit ground
boundaries), `labels` (IDs/types) and optional `source`. Standard SVG/Inkscape
layers can be inspected separately. This is a diagnostic plan, not a styled
architectural drawing: door spans do not assert swing/leaf style, and rooms are
not inferred or filled. Curved walls retain their quadratic path; opening widths
use the same faceted wall path metric as the editor.

Overlay requires accepted source anchors for that floor. It never silently fits
wall bounds to the image, which could disguise incorrect alignment. Anchor fit
consistency still does not prove the anchors match the source. For unregistered
drafts, use `plan.svg` beside the original until correspondences are established.

Malformed references and overflowing opening spans produce errors; the tool
does not guess, clip or repair them. Furniture without width/depth is shown as a
position marker whose radius has no physical meaning. The SVG does not invent
a footprint from the 3D placeholder defaults or treat them as source evidence.
SVG text/IDs are escaped, and only embedded PNG/JPEG/WebP rasters are allowed.
Do not publish overlays containing user source images without permission.

Use three separate review conclusions: **contract valid**, **alignment reviewed**,
and **layer completeness reviewed**. Stop here for a Skill verification task.
Proceed to 3D/viewing/editing only when that stage is the subject of the task.
