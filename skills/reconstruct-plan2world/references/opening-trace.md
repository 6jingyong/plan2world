# Source wall topology and opening review

Plan2World reconstructs the empty architectural shell before furniture. Room-use
labels such as bedroom, balcony or study do not decide geometry.

The A-layer is intentionally split into two responsibilities:

1. **hard wall-frame topology** — raw wall centrelines must normalize into the
   correct closed-space graph without inventing new walls;
2. **soft opening review** — doors/windows are attached to that normalized graph
   and may remain review warnings for later 2D/3D/walkthrough adjustment.

## 1. Raw wall graph normalization

Prepare a local `wall-trace.json` in original source pixels:

```json
{
  "maxJunctionDistancePx": 3,
  "walls": [
    {"id":"top","start":{"x":0,"y":40},"end":{"x":100,"y":40}},
    {"id":"right","start":{"x":100,"y":0},"end":{"x":100,"y":100}},
    {"id":"bottom","start":{"x":100,"y":100},"end":{"x":0,"y":100}},
    {"id":"left","start":{"x":0,"y":100},"end":{"x":0,"y":40}}
  ],
  "enclosures":[{
    "id":"room-1",
    "boundary":[{"wallId":"top"},{"wallId":"right"},{"wallId":"bottom"},{"wallId":"left"}]
  }]
}
```

Run:

`node tooling/normalize-plan2world-wall-graph.mjs --trace wall-trace.json`

The normalizer may only reuse geometry already present in the trace:

- exact straight-wall intersections become graph nodes;
- an endpoint within the tolerance of another wall may snap onto that wall;
- a long wall is split at real T-junctions/intersections into deterministic IDs;
- enclosure boundaries are rewritten onto the normalized segments.

In the example above, `right` is allowed to start at y=0 even though the room uses
it only from y=40 downward. The algorithm splits it at `(100,40)` rather than
requiring the image model to pre-split the wall manually.

This is **topology completion, not wall invention**. The normalizer must never draw
a connector across an unsupported gap. If adjacent room sides still have no shared
intersection/junction within tolerance, the wall skeleton is a hard A-layer failure.

Freeze both the raw trace and normalized result. Use the normalized walls as the
actual draft skeleton and as later opening hosts.

## 2. Door/window operation

A door/window is a zero-thickness interval on a continuous normalized logical wall.
The host remains present across the aperture; the renderer cuts the visible opening
later.

Establish opening presence before operation:

- `single`: one evidenced hinged leaf/arc;
- `double`: two evidenced hinged leaves/arcs sharing one full aperture;
- `sliding`: evidenced sliding-panel/track access, including very wide or full-side systems;
- `opening`: evidenced leafless passage.

A multi-panel sliding system may occupy most or all of one room side. Do not call
it a window merely because it is wide/glazed. Fixed glazing remains a window.

Record actual two jamb/glazing endpoints in the original raster, `wallId`, source
evidence and type evidence. Do not author independent `position`, `width` or
`thickness`; the helper derives draft width/position from the wall path.

## 3. Opening review trace

After wall normalization, prepare `opening-trace.json` using the **normalized wall
IDs**. It may contain:

- `walls`: normalized walls;
- `openings`: observed door/window intervals;
- optional `enclosures`: normalized closed-space loops;
- optional `wallSurfaces`: source-facing `solid/window/door` partitions.

Run:

`node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`

The helper still checks endpoint projection, host association, opening width and
surface consistency. These checks are useful evidence, but their ownership is now
explicit:

- if an opening problem reveals that the **wall itself** is disconnected/wrong,
  promote it to a hard wall-frame failure;
- otherwise an inaccurate/missing window or door interval is an **opening-review
  warning**, not a reason to discard an already correct wall skeleton.

Examples of soft review issues: window width slightly wrong, sliding-door extent
uncertain, operation unclear, one opening omitted from a long glazed wall. Those
can be inspected and adjusted later in 2D/3D/walkthrough.

Examples of hard wall issues: a wall is visibly misplaced, a real wall is missing,
an unsupported wall was invented, or normalized room topology cannot close without
adding geometry absent from the source.

## 4. Visual truth still owns the result

Neither graph normalization nor valid opening mathematics proves source accuracy.
The frozen normalized wall network must still be reprojected onto the unchanged
original raster. A systematic wall-centreline mismatch remains a hard A-wall
failure.

Door/window overlays are reviewed separately and may remain flagged for later
interactive correction without invalidating the bare-house wall frame.
