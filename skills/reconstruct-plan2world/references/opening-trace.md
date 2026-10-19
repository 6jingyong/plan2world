# Source opening intervals

Recognize openings on an already traced wall centreline. A door/window is a
zero-thickness interval on that path, not an independent rectangle, wall or solid.
Keep the host continuous across the interval so room topology survives. The
converter cuts through the host's thickness later; never export an opening
`thickness` (including 0) or a second wall around its frame.

Establish opening presence before choosing its operation. Require visible jambs,
leaves/arcs, access panels, glazing or an unambiguous label in source context.
Neither a wide passage, room adjacency nor a need for access establishes a door.
Record uncertain candidates by source region/reason in assumptions; do not emit
an unsupported door to make circulation work.

For recognized balconies only, `balcony-policy.md` permits explicitly assumed
outer glazing on the traced perimeter. Use the same endpoint helper, but state
"default balcony enclosure policy" and the observed boundary in `evidence`, and
record affected IDs/region in draft assumptions and local source evidence. Full
run endpoints define a full path interval; never claim assumed glass was observed.

- `single`: one evidenced hinged leaf/arc.
- `double`: two evidenced hinged leaves/arcs sharing one aperture. Use one door
  and the full outer-jamb-to-outer-jamb width, not one door per leaf or half width.
  Width alone does not establish double leaves. Record unequal leaves as an
  unresolved styling detail if the native symmetric double symbol is insufficient.
- `sliding`: evidenced sliding access panels; two tracks/panels are not two hinged
  leaves or sufficient evidence of fixed glazing.
- `opening`: source-supported open passage with no door leaf, when applicable.
- When a door exists but its operation/leaf count is unclear, omit `type` and state
  that it is unresolved. The existing single-door default is an editable display
  assumption, not a recognition result. Keep other styles for user selection.

Record each opening's actual two jamb/glazing endpoints in the original raster,
its `wallId`, evidence and type evidence. Do not use a percentage of host length,
repeat a standard door width, or measure a swing-arc diameter as aperture width.
Solid piers between glazed runs remain wall; do not stretch a window across them.
Recheck a trace whose aperture crosses a host boundary; do not duplicate hosts or
invent a connector to force association.

With a Plan2World checkout, prepare this working trace in original pixels:

```json
{
  "cmPerPixel": 2,
  "walls": [{"id":"w1","start":{"x":0,"y":0},"end":{"x":400,"y":0}}],
  "openings": [{
    "id":"d1","kind":"door","wallId":"w1",
    "endpoints":[{"x":50,"y":0},{"x":150,"y":0}],
    "evidence":"Visible jambs and a shared aperture.",
    "doorType":"double","typeEvidence":"Two opposing leaf arcs.","confidence":0.8
  }]
}
```

Run `node tooling/derive-plan2world-openings.mjs --trace opening-trace.json`.
It prints draft `doors`/`windows` fragments plus projection evidence and unresolved
door types. Use these fragments for the first complete draft emission. It never
writes a draft or repairs source geometry. Windows omit `doorType`/`typeEvidence`.
The trace is local working evidence, not a new field in the application contract.

The helper reuses native wall projection and path distance. Project both observed
endpoints, take their two distances along the host, set physical width to their
difference times cm-per-pixel, and find the parameter at their distance midpoint.
For curves this is neither chord width nor the mean of the two parameters. The
native distance metric uses the existing 16 spans; the quadratic `curvePoint`
remains the analytic control point. Translation does not affect width/position.
The default maximum projection residual is 3 source pixels. Inspect reported
residuals and association; do not raise tolerance just to hide an incorrect trace.

In local verification freeze `opening-trace.json` and the helper output with the
complete draft and source evidence. Check the final opening IDs, type, width and
position against those fragments, then compare the original jambs and leaf marks.
Valid projections or nonempty evidence strings cannot prove source recognition.
SVG's opening stripe alone does not verify single versus double leaves; inspect
the frozen `type` and original symbols. Preserve failures without patching JSON.
