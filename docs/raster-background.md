# Raster background estimation

Source pixels use `interior-grid-v1` background estimation before the existing
neutral-ink and contrast layers are frozen. The former outermost-edge median
could mistake a dark photo frame for the background of a white floor plan.

The canonical architecture workflow uses the union bounds of accepted physical
wall observations and accepted functional-zone boundaries, including quadratic
controls, as a **sampling extent only**. Rejected and uncertain observations,
dimension chains, labels and furniture do not choose the extent. Without usable
architectural bounds, sampling covers the image interior. It does not crop the
raster, change coordinates, discard out-of-extent pixels or authorize walls.
Functional outlines retain their existing geometry permissions.

A bounded, stratified grid samples inside the extent, away from the outermost
edges. The median selects a polarity hypothesis. At least 70% of samples must
support a dark (lightness at most 96) or light (at least 160) background. The
corresponding 10th/90th percentile estimates background lightness. Ambiguous
sources freeze empty masks at **all** contrast thresholds, disabling raster
refinement while leaving semantic observations and logical closure available.
This conservative estimator can abstain on mixed-polarity or low-contrast plans;
it does not claim to segment arbitrary photographs or repair missing geometry.

New masks record method, extent, sample count, lightness, support and status in
`backgroundEstimate`. Old `source-ink-mask-v1` files without this optional field
remain supported and replay their original pixels without re-estimation. The
continuation report's legacy `borderLightness` field remains an alias for frozen
background lightness; consult `backgroundEstimate` for the actual method.

Browser and CLI share this code. There is no new model call or Skill prompt,
and centerline correction remains disabled. A code-only validation replays
unchanged observations against original raster bytes in a new directory; it is
not a new visual extraction. Never modify an old mask, stage, draft or native
model to make that replay pass.
