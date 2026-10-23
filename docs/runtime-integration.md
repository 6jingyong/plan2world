# Runtime integration acceptance

Native `Project` is the authoring source. Acceptance follows the exported JSON,
static architecture GLB and dynamic asset package into the actual Godot runtime.
Do not patch generated artifacts or add inference to an engine to pass a case.

## Core checks

```sh
npm test
NODE_ENV=production npm run check
NODE_ENV=production npm run build
npm run catalog:check
npm audit
```

Use the pinned, SHA-verified Godot 4.7.2 described in the
[Godot guide](../runtime/godot/README.md). Run project import, built-in demo boot,
the native-export asset gate and the grounded walkthrough gate from that guide.
The same gates run in core CI; browser/benchmark CI follows the existing main-push
policy. Local integration should also run the complete browser suite and all six
desktop/phone-viewport benchmark cases:

```sh
npm run test:browser -- --project=chromium
LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a npm run test:browser -- --project=firefox --headed
npm run test:browser -- --project=webkit
npm run benchmark:viewer
```

Firefox uses a virtual display and software GL on Linux CI. Install each engine's
native dependencies before interpreting launch failures as application failures.
Keep the configured headless WebKit port (WPE on Linux) for CI parity; alternative
ports can differ in native editing behavior. Resolve launch/library failures
before substituting a port, and retain the native Undo/Redo assertions.
Use independent browser contexts and ephemeral loopback mock-provider ports.
On a small software-rendered machine, run engines in batches to avoid competing
for rendering resources. Benchmark timings describe that environment; allocation,
preservation and teardown assertions remain correctness gates.

## Saved real-house Project

1. Import an existing saved native Project in the editor, review its geometry,
   save it, then use **Export → Download JSON**. The repository's Wikimedia
   two-bedroom downstream baseline can also be imported and saved through this
   normal workflow. That input is a hand-authored draft of a real house, not a
   vision-accuracy result or a native runtime fixture.
2. Export the downloaded Project using `npm run runtime:export -- <project.json>`.
   Keep the native input unchanged. Retain the JSON, architecture GLB, asset
   manifest and GLBs together in a fresh ignored validation directory.
3. Repeat the export to another directory. Compare JSON/GLB bytes and manifest
   descriptors, verify packaged digests and resolve every static node's ownership
   to an emitted native entity or room. Doors/furniture stay outside static GLB.
4. Launch Godot with the exported JSON. Check the compiled spawn, grounded walking,
   closed/open door collision, interaction through either paired leaf, floor
   contact and full-height windows remaining collidable. Inspect rendered frames
   separately from physics assertions. Successful asset loads should leave no
   duplicate compatibility presentation.

## Complementary complex native scene

Do not invent missing features in the saved house to claim coverage. Export the
separate native `runtime-walkthrough-fixture.mjs` through the same real CLI and
engine for the remaining cases:

| Feature | Acceptance |
| --- | --- |
| Curved wall | Shared static mesh follows the authored curve; collision stays aligned |
| Furniture | Catalog/custom assets retain effective size, pose and ownership |
| Columns/windows | Static GLB owns presentation; runtime JSON owns collision |
| Stairs and apertures | Visible steps, preserved slab/ceiling holes, real ascent/descent between authored elevations |
| Doors | Single/slide/paired motion consumes emitted parts; either paired leaf operates the native door |
| Railing/air | Authored railing extrusion is visible; air remains invisible and collidable |
| Missing assets | Exactly one genuine fallback per missing part, with unchanged physics |

## Evidence and limits

Keep run logs, downloaded Projects, artifacts, screenshots and machine-readable
results under `.plan2world-validation/`, not in the fixture tree. Record the tested
commit, tool versions, engine checksum, browser case results, artifact hashes,
compiler diagnostics and the views actually inspected. An interrupted run is not
a completed suite; retain its evidence and rerun the remaining or failed cases.

Linux software GL screenshots establish a rendered integration check, not Windows
Forward+ acceptance, native finish/material fidelity or photorealistic quality.
Keep platform/manual checks explicit. L/U/spiral traversal and fold/overhead motion
remain unsupported pending the native contracts in [migration status](runtime-migration.md).

Publish or prepare the final migration PR only when the user requests it. Local
validation and commits do not authorize a push, PR update or merge.
