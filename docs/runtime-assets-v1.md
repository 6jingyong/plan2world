# Runtime assets, version 1

Native `Project` remains authoring truth. Runtime assets are disposable presentation
artifacts, independent of the compiler-owned collision and interaction contract.

```text
Project catalogId / customModelId + retained attachments
  → compileRuntimeArtifacts()
      → runtime JSON (stable assetRef, instance semantics)
      → architecture.glb (static architecture)
      → <scene>.assets/manifest.json + <sha256>.glb
  → engine asset instances
```

## Identity and packaging

Furniture retains `catalog:<catalogId>` or `custom-model:<customModelId>` as its
`assetRef`; sourceCategory remains source semantics and never selects a guessed
model. Non-opening doors receive `builtin:door-leaf-v1` and `leafThickness`.
Leafless openings have no asset reference. Fold/overhead remain unsupported
closed blockers even though they can display a default leaf. Double/french doors
retain the existing single-body limitation pending an explicit two-leaf contract.

The sibling directory follows the runtime filename: `house.runtime.json` (or
`house.json`) resolves to `house.assets/manifest.json`; a filename without `.json`
resolves to `<filename>.assets/manifest.json`. Architecture overrides do not change
this directory. The CLI writes all referenced GLBs before publishing the manifest.
An export can reuse an existing directory; unreferenced old content-addressed blobs
are not loaded and may be removed when distributing a fresh export directory.

`plan2world-runtime-assets-v1` is closed by
[`schemas/plan2world-runtime-assets-v1.schema.json`](../schemas/plan2world-runtime-assets-v1.schema.json).
Each descriptor has:

- `id`: the engine-neutral entity asset reference;
- `uri`: one relative `<sha256>.glb` filename, resolved against the manifest directory;
- `sha256`, `byteLength`: exact packaged-byte integrity;
- `normalization.translation`, `normalization.scale`: compiler-owned fit transform.

Descriptors are sorted by identity; identical bytes share one file, including
catalog aliases and custom definitions. Original custom bytes are hash-verified
through `readCustomModelSource()` and preserved exactly. Catalog bytes come from
the existing `getModelFile()` mapping and `static/models`, without network fetches.
The existing custom-model static scene, geometry, extension, material and embedded
resource validators also apply; export does not widen model admission. Runtime
import additionally decodes embedded textures through the engine.

Missing model mappings or detached sources produce `no-model`/`missing-source`
diagnostics and omit the descriptor. Corrupt or unsupported supplied bytes fail
export. A missing custom source never silently switches to its catalog fallback.
A consumer may display a clearly bounded compatibility proxy when a descriptor,
file or valid import is unavailable. Neither missing presentation nor fallback
creates, removes or changes a collider.

## Transforms and ownership

Normalization maps the active GLB scene's actual geometry to a centered unit box:

```text
normalized = translation + scale * source
world = entityCenter + yawRotation * (effectiveSize * mirror * normalized)
```

The compiler accounts for nested TRS/matrix transforms, static morph weights and
scene selection. It reads real position accessors rather than trusting declared
bounds. Models must have nonzero extent on all axes. Each engine applies the
emitted affine fit; it must not remeasure meshes, infer orientation, or guess a
pivot. Source asset axes are the existing native custom-model axes: X width,
Y height, Z depth.

Furniture `position` is the effective volume center, in metres; `size` is already
scaled (X width, Y height, Z depth). `mirror` carries native plan X/Y signs as world
X/Z signs; height stays upright. Existing runtime-v1 snapshots without `mirror`
mean `[1,1,1]`. Saved custom definition dimensions supply omitted item dimensions,
then ordinary instance overrides/scales apply. Low furniture can have presentation
without a collider. Missing low models use semantic-sized fallback markers.

Door fit uses `width`, `height`, `leafThickness` and `closedPose`, independently of
its collision primitive. The centered default leaf is a deterministic shared GLB,
written by the same engine-neutral presentation writer used for architecture.
The Godot presentation adapter attaches the leaf to the loader-created physics
node using the explicit closed pose. Existing swing pivot/axis/open angle and
slide axis/travel remain the only motion truth. No leaf geometry is baked into
`architecture.glb`, embedded in runtime JSON or meshed by the runtime loader.

The Godot adapter verifies packaged hashes/lengths and caches imported scenes by
content URI. Each entity receives its own transform hierarchy; shared geometry is
presentation only. The proxy renderer receives the successful entity set and runs
only for missing assets or missing static GLB. The real Godot CI integration gate
checks vertex bounds, colliders, door animation and fallback ownership.

## Scope

This milestone does not remove the legacy browser walkthrough, add furniture
interaction/movement, map native finish/tint metadata to models, expose authored
door model selection, implement two-leaf/folding/overhead mechanics, or expand
non-straight stair traversal. Those require their own authoring/runtime contracts.
