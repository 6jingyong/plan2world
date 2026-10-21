# Source raster centerlines: disabled; explicit diagnostics only

Centerline correction is disabled in browser and CLI generation. The production
architecture module does not import the diagnostic implementation. There is no
CLI or browser option to enable automatic centerline application. Wall colours,
white frames and stroke widths vary by source; stable local pixel support does
not establish source fidelity or a positive net benefit.

The former geometry-mutating selector has been removed. Its read-only replacement
can inspect multi-threshold masks, boundaries, distance-transform ridges and
furniture soft weights, then suggest source-seeded line candidates. It does not
run closure trials, move shared/T junctions, project openings or change furniture.
It returns no normalization/annotation output that could feed assembly. All fits
are unapproved diagnostic candidates, including those with strong pixel support.

Default preparation records `centerlinePolicy: "disabled"` and emits
`centerline-policy.json`. It retains the original source observation, existing
normalization, bounded raster continuation/window-pier refinement and furniture-
guided closure. These earlier algorithms are not the disabled centerline layer.
The native closed-face polygon repair below also remains active.

For an explicit read-only investigation, write a separate directory:

```bash
NODE_ENV=production node tooling/review-plan2world-centerlines.mjs \
  --stage "$RUN_DIR/prepared/architecture-stage.json" \
  --output "$RUN_DIR/centerline-diagnostic"
NODE_ENV=production node tooling/render-plan2world-raster.mjs \
  --review "$RUN_DIR/centerline-diagnostic/centerline-diagnostic.json" \
  --source "$RUN_DIR/source.jpg" --output "$RUN_DIR/centerline-diagnostic-images"
```

The review can inspect historical frozen source observations without reassembling
or replacing their stage. It freezes the input stage hash and refuses overwrites.
Purple dashed lines in its image are unapproved candidates. It emits no draft or
replacement wall trace. Historical embedded centerline reviews can still be
rendered explicitly with `--stage`; that does not resume their application.

`relative-geometry.json` is independent of image fitting. It divides final Bare
House coordinates by the same `max(sourceWidth, sourceHeight)` on both axes,
including curved control points, retaining the source aspect ratio. Native
centimetre conversion and one-real-length planar calibration remain unchanged;
heights remain independent. The existing source-image two-point calibration
supports this; no selected-wall calibration UI is added here.

## Native room polygons

Closure trials must evaluate the same closed face that the native graph traced.
The previous room-polygon code discarded that ordered cycle, greedily chained
unordered wall IDs, and returned an open chain if chaining failed. Rendering and
containment then implicitly joined the chain's ends, creating a false diagonal
and cutting off real floor area. An attached inner loop can trigger this even
when every original wall is correct.

The native program now retains each traced face polygon, strips exact dead-end
backtracks, and reuses that geometry for rooms, rendering and containment. A face
walk may traverse both directions of an edge, so its budget is twice the graph's
edge count. Open chains never become room polygons. This is a program repair;
no wall, opening, furniture position or generated model is edited.
