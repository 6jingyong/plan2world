# Source floor-plan registration

Plan2World keeps the uploaded floor-plan raster as the native 2D `backgroundImage`. Draft v1 may additionally include optional `sourceRegistration` metadata so that the raster can be aligned to reconstructed walls automatically instead of only being fitted to wall bounds.

## Contract

```json
{
  "sourceRegistration": {
    "floorId": "floor-0",
    "confidence": 0.9,
    "anchors": [
      { "wallId": "w1", "endpoint": "start", "image": { "x": 0.12, "y": 0.18 } },
      { "wallId": "w8", "endpoint": "end", "image": { "x": 0.84, "y": 0.79 } }
    ]
  }
}
```

`image.x` and `image.y` are normalized source-image coordinates in the range `0..1`, measured from the top-left corner. Each anchor references a wall endpoint rather than copying a world coordinate. This keeps registration valid when the user performs the pre-import scale correction, because the endpoint moves with the reconstructed geometry.

## Runtime fitting

When at least two valid anchors are present, Plan2World resolves their current wall-endpoint coordinates and solves a best-fit 2D similarity transform:

- uniform scale
- rotation
- translation

The source raster is never stretched non-uniformly. With three or more anchors, the fit is checked for residual error. A visibly inconsistent AI registration is discarded and Plan2World falls back to the deterministic wall-bounds fit introduced by the source-underlay pipeline.

Registration is advisory metadata. Invalid or missing registration must never prevent otherwise valid reconstructed geometry from opening.

## Prompt guidance

Vision providers should use exact visible wall-centreline corners or T-junctions, spread anchors across the plan, and prefer 3–6 reliable anchors. Page corners, dimension arrows, text labels, and furniture are not registration targets.
