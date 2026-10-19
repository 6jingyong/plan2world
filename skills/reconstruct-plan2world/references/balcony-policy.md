# Default balcony enclosure policy

Model every positively recognized balcony/terrace as an independent enclosed room.
This is a product assumption, not a claim that the source shows sealed glazing.
Keep the unchanged source evidence and generated enclosure decisions separate.

1. Establish balcony identity and its actual perimeter from source boundaries in
   the component pass, before furniture. A label, bounding box or blank exterior
   space alone does not establish a complete perimeter. Do not apply this policy
   to bay-window ledges, equipment platforms, shafts, voids or access/fire passages.
2. Trace the supported perimeter as zero-width wall paths, reusing the house-side
   wall once. Complete the host across evidenced access openings so the balcony
   and house remain separate wall-derived rooms. Preserve straight/curved paths,
   recesses, solid piers and shared junctions; do not straighten an arc or move a
   guard edge inward for convenience. Do not invent missing bounds or access doors.
3. On each exterior side, use hosted windows for the supported perimeter except
   observed solid walls/piers. A source-open guard may become a continuous glazing
   host under this policy. Keep observed glazing separate from assumed glazing.
   For a fully glazed curved run, use its actual two path endpoints and the native
   path-distance helper; full-run width is the path length, not chord length or a
   fixed percentage. Split around genuine piers/junctions. Keep every host intact.
4. Omit wall thickness/height and window height/sill/type unless supplied by the
   user or reliable source evidence. Normalization supplies editable wall properties
   and floor-to-ceiling glass. No opening has independent thickness. Ceiling and
   window styling/refinement belong to later user editing; do not infer storeys.
5. Reference the enclosing walls and hosted windows from the `balcony` component.
   Use no authored room polygon and no overlapping `floorArea`: native wall topology
   owns the room/floor once. A railing inventory item may retain the original guard
   evidence, but must not generate a second solid on the same boundary.
6. In draft `assumptions`, identify each affected balcony, assumed host/window IDs
   and source region, and state "default balcony enclosure policy". In local opening
   traces, prefix assumed-window evidence with that policy and name the observed
   boundary; never fabricate source-visible glazing/jambs. Record observed and
   policy-derived IDs separately in `source-evidence.json`. Valid interval maths
   does not establish balcony classification or correct boundary tracing.

If the perimeter or house-side separation is unclear, disclose the incomplete
room and omit unsupported geometry. Do not invent an outline to satisfy the policy.
Historical/manual open `floorAreas` remain import-compatible; do not rewrite old
verification JSON. New reconstruction uses this enclosure default.
