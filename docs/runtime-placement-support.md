# Complete furniture support and incremental updates

Shared runtime artifact compilation checks the entire rotated footprint of floor
furniture against the union of the emitted same-floor support triangles. It
subtracts each convex triangle from remaining footprint fragments; overlapping
floor surfaces cannot inflate coverage and conceal an aperture. Boundaries may
touch; positive unsupported area blocks export with the item/floor identity.
Native JSON remains readable for correction, including invalid older layouts.

Godot previews use the same subtraction over the supplied runtime floor
triangles, cached on scene changes. It does not triangulate rooms, sample only
corners, infer floors from GLB or relocate furniture. Ceiling previews restrict
support to their explicit compiled host; native ceiling geometry validation
remains authoritative. Live physics and default closed-door clearance still
apply independently.

The offline core compiles a complete candidate and package before accepting an
edit. The Godot update compares current/candidate furniture descriptors and
stages only changed models/colliders. Unchanged furniture, picking Areas, lights,
architecture, player and doors retain their nodes. Plan materials and light
sources update by owner; a view/preset change still applies the complete style.
Failed candidates retain the current source/world. No accepted edit log is kept.

Local authored benchmark: `node tooling/runtime-layout-benchmark.mjs NEW_DIR`
freezes 100/500/1,000-item Projects, five compiler/edit/package timing samples and
real exported assets. Explicit ground boundaries avoid using room-detection area
limits as a performance fixture. It is a local CPU workload, not device or
Windows/GPU qualification; compiler timings exclude process startup and rendering.

At this milestone, isolated headless 4.7.2 comparisons (five updates per input)
gave main-thread update medians of 44.8→8.6ms, 235.5→15.5ms and 435.3→35.5ms.
Compilation remains complete: the measured warm 1,000-item shared compilation
was 10–27ms, with packaging 7–8ms. Static artifact caching and persistent worker
processes were not necessary to fix the observed full furniture-rebuild bottleneck.
Raw timings and the before-source copy stay in the ignored development run.
