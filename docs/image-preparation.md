# Floor-plan image preparation

Preparation happens **before either model observation**. It changes the image
coordinate frame, not architecture or the native Project's role as authoring truth:

```text
original photo → confirm working image → architecture → furniture
→ deterministic reconstruction → native Project → runtime artifacts → Godot
```

Flat images use identity preparation. No fixed grid, per-tile reconstruction,
automatic edge detection, enhancement, inpainting or additional model call is
introduced. Local crops remain optional inspection views for a concrete doubt;
E1/E2 did not establish an overall extraction gain.

## User workflow

Both the native desktop creation page and internal browser image dialog offer
**Correct a photographed rectangle**, four draggable corners, known reference
width/height, output width, quarter-turn rotation, preview and confirmation.
Corner arrow keys make small adjustments; Shift increases the step. Native input
focus follows the clicked corner. Native preparation works without an AI account.

Select the paper or another known rectangle, not the apartment outline. Keep
dimension labels within it. Corners are ordered TL, TR, BR, BL in the displayed
upright source. Choose A4 portrait/landscape only for that actual paper/reference;
otherwise enter a known ratio using the same units for both sides. Four corners
alone do not recover a true width/height ratio. Image proportion and real building
scale remain separate; use a printed/known length for centimetre calibration.

Preview the correction and choose **Use prepared image**. Any subsequent change
invalidates that confirmation; desktop paid-image consent is also cleared.
Both observations receive the same confirmed image. Pixel refinement, source
background, trace overlays, entrance markers and calibration use its coordinates.
Ordinary flat uploads keep the existing direct workflow. JPEG EXIF direction,
including mirrored orientations, is normalized before native corner selection;
manual output rotation is independent of perspective mode.

## Shared ownership and provenance

`imagePreparation.ts` owns validation, projective matrices, inverse mapping,
premultiplied bilinear sampling and exact quarter-turn/orientation transforms.
Browser Canvas and native image controls only decode/encode/display and collect
input; GDScript does not calculate a second homography. The offline authoring
process uses a deterministic RGBA PNG writer. Flat identity input keeps its
original encoded bytes. Derived pixels are deterministic; PNG compression is not
claimed byte-identical between browser Canvas and the native encoder.

`plan2world-image-preparation-v1` records original file SHA-256, upright pixel
SHA-256/dimensions, JPEG orientation, normalized four corners, explicit aspect
ratio, output dimensions, clockwise quarter-turns, forward/inverse matrices and
working file/pixel hashes. Matrices map **EXIF-upright source pixel edges**
`[0,width] × [0,height]`; pixel centres are at `n + 0.5`. They never map native
centimetres or independently fit geometry. Source/working hashes are distinct.

The native Project keeps `reconstruction.inputPreparation`; transformed inputs
also retain the original data URL, while the tracing background contains the
working image. This is historical import evidence, ignored by runtime compilation.
The desktop session retains original, upright pixels, working image/pixels and
manifest. Before any paid observation it verifies the confirmed hashes. A failed
preparation or reconstruction keeps evidence and the previously open world.

## Skill / CLI

Prepare a fresh directory (omit `--recipe` for identity):

```sh
NODE_ENV=production npm run image:prepare -- \
  --source photo.jpg --recipe rectangle.json --output NEW_INPUT_DIRECTORY
```

Example recipe, with corners selected against that source and a known A4 ratio:

```json
{
  "mode": "perspective", "quarterTurns": 0,
  "corners": [{"x":0.1,"y":0.1},{"x":0.9,"y":0.2},
              {"x":0.8,"y":0.9},{"x":0.2,"y":0.8}],
  "aspectRatio": 0.7070707070707071, "outputWidth": 1600
}
```

Start both observations from `working.*` and pass that same file to preflight,
prepare and inspect. The final strict assembler also writes a native Project with
its registered background and retained original/preparation evidence:

```sh
NODE_ENV=production node tooling/plan2world-architecture.mjs assemble \
  --stage prepared/architecture-stage.json --furnishing source-furnishing.json \
  --source NEW_INPUT_DIRECTORY/working.png \
  --input-preparation NEW_INPUT_DIRECTORY/input-preparation.json \
  --original-image NEW_INPUT_DIRECTORY/original.jpg --output NEW_ASSEMBLY_DIRECTORY
```

Use the actual filenames returned by preparation (identity may keep JPEG/WebP).
`project.json` uses the existing native conversion and includes source-zone review;
it does not choose an entrance or accept source fidelity. The assembler verifies
working/original file identity and dimensions before writing any outputs. Pixel
refinement remains in the frozen stage, not a new fit at handoff.
Do not mix earlier photo coordinates or rewrite a frozen observation after a crop.
The tool refuses an existing output directory. It uses the existing local
Chromium pixel decoder, without a provider or network request.

## Limits and validation

JPEG/PNG/WebP inputs remain limited to 12 MB / 24 million decoded pixels;
the prepared image also respects those limits. Invalid/concave/crossed corners,
unknown ratios, singular transforms and oversized results fail before paid work.
This is planar perspective correction, not lens calibration, folded-paper
flattening or recovery of blurred/obscured details. HEIC input and automatic
paper-edge detection are not implemented.

Synthetic tests establish reversible coordinates, pixel-centre alignment,
orientation, deterministic output, confirmation invalidation, exact model-image
transport, background/provenance persistence and pre-request hash checks.
They do **not** establish real phone-photo extraction accuracy. Preserve original
failures and evaluate that separately with real photographed plans.
