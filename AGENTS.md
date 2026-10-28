# Plan2World agent guide

## Mission

For current completed milestones, deferred work and the next implementation
priority, read [the development handoff](docs/development-handoff.md). It does not
replace the invariants below or authorize future pushes/merges.

Plan2World turns a floor-plan raster into an editable browser home and an engine-neutral compiled runtime. The existing openPlan3D `Project` remains the canonical authoring truth, with its editor, history, persistence and Three.js review/preview surfaces. Runtime experience is derived from that Project through deterministic artifacts and consumed by Godot or future engines. Do not create a competing canonical scene graph.

## Canonical reconstruction

**original raster → optional confirmed image preparation → one architectural observation (functional zones/walls/openings/scale), freeze those observations → furniture semantics/positions → deterministic raster refinement + functional-zone logical closure + opening audit → freeze final architecture and furniture anchors → deterministic draft assembly → native application**

- Input preparation is shared deterministic authoring code. JPEG EXIF direction,
  manual quarter-turns and four-corner rectification happen BEFORE observation.
  Perspective mode needs a known rectangular reference and explicit aspect ratio;
  never square off the apartment outline or infer page proportions. Freeze original
  and working image, reversible transform and hashes. All later pixels, observations,
  scale and overlays use the working image; native reconstruction evidence retains
  provenance and the original when transformed. This is not runtime semantics.
  See `docs/image-preparation.md`. Local crops inspect specific doubts; fixed grids
  and per-tile reconstruction stay optional/low priority, not default stages.

- The direct Skill records `source-architecture-v1` in original image pixels,
  including concise visual evidence, decisions and uncertain/rejected candidates.
- Wall evidence `source-wall-trace-v1` is projected from that observation by code.
- User geometry policy: new reconstruction and native authoring default to straight
  polygon segments, including modest polygon approximations of rounded outlines.
  Do not plan or add curve-editing/mounting features. Preserve openings, recesses
  and connectivity; retain compatibility with already-authored native Project
  curves without silently flattening or rewriting them.
- The normalizer owns intersections, splitting, snapping and evidenced door-gap connectivity.
- Optional visible junction points remain source-pixel evidence without wall IDs.
  Source-topology review reports near misses beyond conservative snapping; it
  never extends walls. Indoor connectivity review uses native collisions inside
  indoor regions, excluding furniture/exterior detours, and never adds entrances.
- The architectural OBSERVATIONS are frozen before `source-furnishing-v1`;
  the furniture observer cannot add/remove/reconsider openings or walls/scale.
  Furniture positions reach the program BEFORE final closure. Programs select
  bounded continuations of observed wall endpoints using furnished closed
  regions and existing entrances, then freeze final geometry and those anchors.
- Before furnishing, shared observation preflight rejects invalid source bounds
  and duplicate/overlapping walls. Its temporary graph is discarded; it never
  accepts opening hosts or final zone closure and never repairs observations.
- Programs project accepted evidence into the existing `source-annotation-v1`
  assembler contract. Browser, CLI and portable Skill share this order; the
  architecture prompt includes functionalZones in the same observation. Direct Skill tests do not
  establish external-model extraction quality.
- The browser decodes original pixels; the Skill/CLI uses `prepare --source original.jpg`. Neutral-ink evidence is frozen for replay. Raster-supported continuations and bounded, unique window-junction refinement run before final architecture freeze; they add zero model calls and retain original observations and decision audits. Geometry-only callers without pixels are an explicit compatibility/ablation path.
- Centerline correction is DISABLED in browser and CLI generation. Whole-image ridge/furniture-weight/fit diagnostics run only through the explicit read-only review command; their unapproved candidates never enter closure or assembly. Do not re-enable correction, project openings with candidate lines, or move junctions from a review. See `docs/raster-centerlines.md`. Independent relative geometry uses one divisor for both axes; native centimetre calibration remains uniform.
- The assembler owns IDs, host matching, cm conversion, opening width/position, furniture catalog IDs, source registration and `plan2world-draft-v1`.
- The native application owns room derivation, editing, persistence and browser review/preview. The deterministic runtime compiler derives `plan2world-runtime-v1` plus `architecture.glb` from that same native Project. Godot consumes those artifacts for runtime collision and interaction; it must not redo reconstruction, room detection or topology repair.
- Hand source-zone review to the browser separately from draft geometry. Optional
  native `reconstruction.observationReview` records historical import counts and
  findings, never a second geometry or live correctness verdict. Keep current
  native geometry checks separate; runtime artifacts must ignore this metadata.

Core rule: **LLM observes; programs calculate and assemble.**

### Annotated native correction

The user now prefers source problems as located review notes, followed by manual
wall/opening correction in Godot, rather than another model repair request. The
desktop/portable correction path may continue its original two observations after a source
preflight failure. Keep the raw observations and working-image identity in the
canonical Project's authoring-only `architectureReview`; retain valid geometry,
and mark unapplied/uncertain features without inventing their hosts. Strict source
APIs remain available. Operational provider/file failures still fail normally.

An incomplete canonical Project may open/save in the native 2D correction window
without a compiled walkthrough. Shared TypeScript commands own wall addition,
endpoint edits, exact splitting, opening attachment and room derivation. Godot
only displays the read-only editor projection and submits explicit human edits.
Do not split presentation triangles into another authoring model. The strict
runtime compiler still owns floors, openings, collision and safe entry; commit a
new world only after it compiles. Keep the previous world until then.

Per the latest user policy, normal top-view work is ground, furniture and openings.
Advanced wall correction starts disabled; every actually changed surviving wall
(including moved junction neighbours and split segments) retains `authorModified`.
Show these walls in amber in top view and protect repeat corrections unless the
user explicitly enables marked-wall editing. This is current authoring metadata,
not operation history; do not add product Undo/Redo.

Accepted floor surfaces have default invisible outer air guards, including exposed
paved ground. Derive their union perimeter in the shared runtime compiler; no
internal seam barriers, outline hull, source-wall insertion or filling slab holes.
`box.purpose: perimeter` blocks locomotion only, independently of actual door
obstruction; native architectural air walls retain their existing full collision.
Ground is an explicit canonical `Room.boundary`, edited in the same Godot world.
Opening placement projects an explicitly picked host in shared code and stages
a cancellable width/position/height preview. Godot does not own geometric acceptance.

Door material (`wood`, `glass`, `steel`) is presentation, separate from opening
motion. Appearance swaps must preserve the existing physics bodies, open state,
player and other doors. Existing mechanical configurations remain compatible.
See [native correction](docs/native-architecture-correction.md).

### Explicit source recovery

The normal two-observation path and strict parsers remain unchanged. An explicitly
enabled recovery session may project immutable raw observations into a separate
program input: union exactly coincident wall coverage, cancel zero-area straight
wall-outline spurs, canonicalize an unambiguous wire alias, and derive an aperture
gap only from accepted door jambs with unique exact opposing wall flanks. Retain
the original records, transformations and failed initial stages; no coordinate
fitting, larger snap tolerance, convex hull, inferred access or discarded feature.

One explicitly supplied reviewer callback may confirm source evidence locally,
before or after furnishing, with a shared budget of one for the entire execution.
Keep unconfirmed/invalid answers pending. Bind the answer to source, observations
and the failed stage; restrict edits to requested source records, preserve accepted
features and zone seeds, then rerun strict preflight/host checks and create a new
stage. Never edit the original observation, frozen stage, draft or native scene.
An aperture-only host hypothesis needs actual source confirmation and spans only
the accepted aperture. No native IDs or host matching are reviewer responsibilities.
Default browser/desktop callers have no reviewer and no extra paid request.
See [source recovery](docs/source-recovery.md).

## Furnished-space enclosure prior

User-defined default: a furnished indoor space is expected to have a fully
closed logical architectural boundary. Door/window/passage host baselines count
toward that boundary; a closed boundary does not mean a room without entrances.
Extract furniture semantics/positions before final program closure. Furnishing
is algorithm input, not an added visual wall-identification pass or a stronger
wall prompt. Collect functionalZones in the architectural observation; do not add a third
LLM call. Keep furniture semantics/position-only.

The deterministic closure program may choose local connections already supported
by observed wall continuations and nearby observed boundaries, using whether
they create additional furnished regions with observed entrances. Record each
source-to-normalized endpoint move and its before/after metrics. Never invent
an unsupported wall, move furniture, or overwrite generated JSON/3D to make a
case pass. Once final geometry and guiding anchors are frozen, later edits to
either observation require a new stage. Original observations stay unchanged.

Furniture anchors outside closed regions remain review findings when no safe
candidate exists; incorrect anchor positions are also possible. An occupied
enclosure that needs several jointly useful connections can remain unresolved
by the current conservative single-connection algorithm.

An open kitchen/living/dining arrangement can share one enclosing boundary;
furniture objects or clusters do not each imply separate rooms. Outdoor/balcony furniture does not imply opaque surrounding walls. Every
accepted balcony still requires a closed logical boundary, using glazing,
railing or an explicit invisible air boundary where source-supported. A closed region
can still merge several rooms incorrectly, so check source-supported internal
partitions and junctions separately. Furniture containment is not a source-
acceptance verdict.

## Functional zones and traversable components

The user's "通行区" here means a mutually reachable collection of spaces,
not merely a circulation corridor. One traversable component may contain
several independent functional zones. This is a containment/connectivity
relationship, not a universal comparison of floor areas or region counts.

A doorless walk-in closet can be an independent functional zone. Its logical
boundary includes the entrance baseline, while that entrance remains passable.
Use the existing `door.type: "opening"` for a source-supported leafless passage:
it closes the logical host baseline for room derivation without adding a door
leaf or blocking the aperture. A window remains a window, even when full-height.

Furniture supports functional-zone inference but does not by itself establish
a unique boundary, entrance position or entrance width. Record real wall
evidence separately from any proposed logical entrance span. Such a span needs
source-supported aperture/jamb/partition-end evidence; do not partition every
furniture cluster, bridge exterior recesses, or invent physical walls. In a
fully open arrangement without a supported threshold, keep the functional
subdivision uncertain. The functional-zone program inserts uncovered explicit
passage/railing/air spans, then tries bounded wall-end connections using native
zone separation and furniture preservation. Balconies are independent logical
enclosures even without furniture. Air boundaries are invisible native walls
with collision; railings start at an editable 110cm, not an observed height.
The legacy furniture-only closure is a compatibility path without zone evidence.

## Fix the earliest wrong artifact

- wrong visible wall/opening/scale evidence → architecture observation;
- wrong split/snap/topology → normalizer;
- wrong furniture evidence → furniture observation;
- changed architecture after furniture assembly → program integrity check;
- wrong host match, units, IDs, registration or final draft → assembler/parser;
- wrong room derivation, 2D editing or browser 3D review → native application;
- wrong runtime semantics/collision/interaction contract → runtime compiler;
- wrong architectural presentation mesh → architecture mesher/GLB writer;
- wrong engine loading, input, physics or runtime interaction behavior → engine adapter (currently Godot).

Never compensate for a deterministic bug with prompt instructions. Never hand-edit a generated artifact to make a later screenshot pass. Never patch an engine adapter to hide an upstream runtime or mesh defect.

## Fresh validation

Every image-quality rerun starts from the original raster and a new ignored directory:

`.plan2world-validation/runs/<run-id>/<sample-id>/`

Do not use an older run as input. Do not write generated wall traces, annotations, drafts, overlays or reports under `tests/fixtures`.

`tests/fixtures/real-floorplans/reconstruction-corpus/manifest.json` contains source identity only. Human source references live separately under `tests/evaluation/plan2world/source-references/` and may be read only after the fresh wall evidence, Bare House, annotations, draft and source overlay are generated and frozen.

Historical runs and development diaries belong in Git history, not the active tree.
Per user instruction, retain the compact versioned experiment ledger at
`docs/observation-experiment-results.md`. Each round records its question, declared
variables (label combined workflow trials), source/code identity, actual results,
failures, conclusion and next decision, with links to frozen ignored evidence.
Keep bulk diaries/artifacts out
of the active tree; do not erase negative results when later fixes pass.
Use the ledger's effectiveness table for orientation; read individual historical
rounds when their variable or failure is relevant.

`runtime:validate` records separate source/structure/door-motion/arrangement/save/
walkthrough/rendering scopes. Every supported door is tested in its own original
closed physics world without a player; record blocked leaves/owners and unsupported
motions. Untested scopes remain `not_run`, never borrow a compiler or CI pass.
Frozen reconstruction and later deliberate user arrangement are separate inputs.

## Draft invariants

Use `schemas/plan2world-draft-v1.schema.json` and `docs/plan2world-draft-v1.md`.

- lengths are centimetres;
- walls are zero-width centrelines with optional quadratic `curvePoint`;
- doors/windows reference existing walls;
- source registration, when present, is strict and must not fall back to independently fitted bounds;
- current semantic reconstruction declares `furnitureVocabulary: "plan2world-furniture-v1"`;
- fixed-vocabulary furniture uses `catalogId: "imported_object"` plus exact `sourceCategory` and source-supported position;
- `imported_object` renders as an editable native block; no project-wide presentation flag is required;
- initial reconstructed doors/windows extend from floor to host wall height,
  with window sill 0; this editable product default is not image evidence;
- furniture extraction owns semantics/position only; non-colliding selectable
  markers, replacement and snapping are application responsibilities;
- source-supported open ground may use `floorAreas`; never invent walls merely to force closure.

## Runtime invariants

- Browser and CLI runtime scene ZIP export must share `compileRuntimeArtifacts()` and the same serializer. ZIP is transport for the existing artifacts, not another semantic schema or authoring format. Retain native Project/package backups separately.
- The runtime scene picker/loader accepts compiled JSON with sibling GLB/assets only. A separate native Godot furniture editor may open a canonical Project through the packaged shared data/compiler core. Never duplicate native validation, IDs, asset fitting or runtime compilation in GDScript.
- Godot owns both first-person and top-view cameras/input/animation, ray picking and placement queries. Use the same 3D world; do not embed browser HTML or a flattened plan renderer. Furniture-only commands preserve architecture and Project attachments; static world/player/door state survive layout updates. The browser remains internal authoring/review tooling and is not required in delivered players. See [furniture layout](docs/godot-furniture-layout.md).
- Scene-menu pause, failed-open recovery and world replacement must preserve engine ownership.
- Product furniture editing has no Undo/Redo or retained operation history. Keep
  only the accepted current Project plus an in-flight candidate; save current
  native coordinates/rotation/assets atomically. Internal browser authoring undo
  is separate and remains available.
- Main entrance identity and inward side are native authoring metadata. Compile
  its spawn/facing and reject blocked/unsupported starts; Godot never guesses a
  main door or relocates the player to hide a bad anchor.
- First-person furniture adjustment uses keyboard/gamepad micro-movement only.
  Ground items move in the plan plane at fixed elevation; wall items use explicit
  compiler-owned wall frames, height bounds and opening exclusions. Do not infer
  attachment from asset meshes or nearest walls. Curved attachment is unsupported.
- Top-view snapping is native input assistance over compiled wall/item dimensions. Keep grid, wall flush/orientation and nearby furniture guides optional with explicit release; first-person micro-adjustment never snaps. Floor wall alignment changes pose only, never infers a wallMount. Save snapped position/rotation atomically through the shared native edit core; physics and compiler validation remain authoritative.
- Native catalog category/dimensions/illustrations are a read-only editor projection. Keep symbols out of runtime artifacts and physics; reuse authoring symbols instead of rebuilding furniture geometry in the adapter. Catalog/selection actions use the existing shared native commands, not a second scene model.
- Settled Godot top view uses orthographic projection; floor/top points must align at different heights, with parallel picking rays. Walkthrough retains its own perspective camera. Keep drawer framing/zoom and planar snapping independent of camera altitude/FOV.
- Plan presentation reuses the same Godot world with unlit materials and disabled sun/fixture lights/shadows/AO. Compiler-owned aperture bands in architecture GLB carry `view: "plan"`; engines hide them in walkthrough and never reconstruct them from wall/collider meshes. Restore materials, world state and the selected natural-light preset on return.
- Ceiling fixtures bind an explicit native enclosure wall-ID set, using the same native ceiling-height policy as the compiler. Shared code validates the whole footprint and holes; do not guess a ceiling, flatten a sloped roof, change room topology or move the fixture to recover invalid source data. Runtime movement names the emitted ceiling room/elevation. Native plane dragging and first-person nudges never change height/host. Saved light settings and compiler-owned local source position/direction drive real engine lights independently of asset meshes/colliders. Lamp assets stay dynamic, not baked in architecture; natural-light presets are session view state, not edit history.
- Optional desktop image creation is an authoring surface, separate from the offline runtime loader and offline edit core. Its private stdio task delegates the same two-observation/raster/assembly pipeline to the shared TypeScript core. OpenRouter credentials stay in process memory, never argv, request files, Project, artifacts or logs; explicit image consent precedes paid work, with no automatic retry. The user selects the main door/inward side; never infer or relocate spawn. Native source-preview door markers are read-only projections, not engine topology.
- Desktop continuation is explicit, bound to copied original/working inputs,
  preparation, pixels, model, scale hint and actual prompt hashes. New tasks do
  not silently reuse observations; continuations call the same shared pipeline
  through a replaying observer, with 2/1/0 missing requests. Publish inherited
  freezes before advertising the next checkpoint. Preserve old attempts and
  unknown billing after interruption; usage/checkpoints stay authoring-only.
  See [desktop continuation](docs/desktop-reconstruction-resume.md).
- Runtime geometry failures on a valid native Project may offer a contextual
  correction action. Keep file/asset/write failures operational, preserve the
  previous world, and never open correction automatically. Unsaved-change
  cancellation retains the exact recovery target.
- Furniture must leave every explicit door leaf's default closed volume clear.
  Shared artifact compilation validates this independently of transient engine
  door state; native JSON backup stays editable. Godot previews reuse the emitted
  closed colliders as placement-only Areas, never walking bodies or inferred swing
  envelopes. Engines still handle live door obstruction. Leafless openings remain
  unreserved. Re-export older snapshots to apply the current compiler checks.
- Invalid/overlapping native apertures block shared runtime artifact compilation
  before presentation could omit the host wall. Keep invalid native backups
  editable. Source semantic blocks (`imported_object`, `renderStyle: block`, no
  custom model) stay selectable without arbitrary proxy walking collision;
  the compiler labels them `representation: source-marker`. Validate their observed
  point against actual floor triangles, not their arbitrary display-block extent;
  do not reserve that extent against doors or obstacles. Off-floor/hole anchors
  still fail. Authored replacements and legacy ordinary objects retain complete
  footprint support, door clearance and normal collision.
- Validate/load a candidate outside the active SceneTree before swapping worlds
  and editable source. Reject mismatched present GLBs using the compiler digest;
  failed loads must retain the previous scene. Missing assets remain explicit
  presentation fallbacks and never become physics truth.
- Desktop focus loss pauses and clears held controls; focus return requires explicit resume. Manual return to start uses only the compiled spawn, resets player motion/view, and preserves world/door state. Never invent a floor, infer a safe target or silently repair an authored aperture for recovery.
- Distinguish native Windows CI execution from Windows cross-builds and PowerShell installer checks on Linux; neither proves Windows Forward+ hardware/input acceptance. Release boot assertions use the engine log file so Windows GUI binaries do not require console stdout.
- Verify delivery from relocated player/scene ZIPs. Official release templates disable script/path overrides: assert launcher/physics against the exact exported PCK with the pinned editor, then separately boot the actual release executable. Do not add production test execution hooks or claim this proves Windows hardware behavior. See [runtime delivery](docs/runtime-delivery.md).

- Door interactions contain explicit stable leaf parts with collider/asset references, size, closed pose and type-specific motion. Never infer leaf count, split width or hinge positions in an adapter. Double/french leaves share one native door interaction state. Re-export old derived snapshots rather than adding single-leaf inference.
- Native railing boundaries use authored height/thickness for compiler-owned extrusion; air stays invisible with collision. Do not infer balusters or other unretained detail.
- Preserve native no-ceiling policy for outdoor rooms and explicit ground boundaries in the compiler; do not infer a roof merely from uniform wall heights.

- The native `Project` is authoring truth. `plan2world-runtime-v1` and `architecture.glb` are deterministic derived artifacts; a Godot `.tscn` is never canonical.
- Every emitted room surface must compile floor collision. Untriangulatable surfaces and invalid/unresolved explicit native ground or `floorOpening` boundaries block shared browser/CLI export before output; never silently skip the floor/aperture, fill a hole or move spawn to hide failure. Preserve native editing and JSON backup for source correction.
- Runtime JSON owns engine-neutral semantics, colliders, interaction contracts and player profile. It may contain explicit collision geometry such as triangulated walkable room floors, but never presentation-mesh data. `architecture.glb` owns architectural presentation geometry. Never infer runtime collision from GLB.
- The Godot runtime loader owns scene semantics, collision bodies and interaction nodes only. Presentation proxies are an isolated fallback adapter and must not leak back into loader logic.
- Missing presentation GLB may use proxy visuals for compatibility, but proxy geometry must not become a second source of architectural truth.
- Dynamic furniture/door assets resolve through `plan2world-runtime-assets-v1`: reuse catalog GLBs and verified custom-model Project attachments. The compiler owns normalized fit transforms; adapters must not measure model bounds to infer size, pivot, collision or motion. Keep entity `assetRef` identities independent of relative packaged file URIs; never embed engine paths or presentation vertices in runtime JSON.
- Sliding or unsupported door motion must remain explicit. Never fake a sliding/bifold/garage door as a hinged door to make a demo look functional.

## Product invariants

- Selected furniture, doors and windows expose one compact Modify action. Reuse
  the add catalog's category/search/thumbnail component for modification, bind
  choices to that selected native object, and commit only after explicit apply
  or accepted placement preview. Keep Add/Modify browse filters separate. Door
  material and window presentation changes preserve physics/player state; native
  opening geometry correction remains an explicit shared-core authoring command.
- Keep 2D correction and browser 3D review/quick preview on the same native Project, then compile runtime artifacts from that Project.
- The legacy browser FPS runtime is removed. Keep Three.js focused on authoring, review and quick preview. Do not reintroduce `ThreeViewer` into the target game/runtime layer with FPS controllers, runtime physics, door/furniture interaction state machines or equivalent engine responsibilities.
- Keep Godot focused on runtime input, physics, interaction, animation, lighting/materials and future experience features. It must not redo AI reconstruction, room detection, wall inference or topology repair.
- Keep local/manual JSON import possible; AI must not be mandatory.
- Preserve existing custom-model/project-package infrastructure for future asset replacement.
- Generated geometry is evidence-bearing draft data, not ground truth.
- Preserve upstream MIT attribution.
- Do not expand reliability work into BIM, structural analysis or photorealistic reconstruction.

## Verification

Run relevant focused tests and normally, before merge:

```bash
npm test
npm run check
npm run build
```

For browser UI/3D changes, run the relevant Playwright regression. Core CI also downloads the pinned Godot 4.7.2 build, verifies its checksum, parses/imports the Godot project and boots the built-in runtime demo headlessly, then exports a native Project and verifies actual asset placement/door motion/fallbacks plus grounded walking, collisions and straight-stair ascent/descent in Godot; Godot adapter changes must pass that gate. After any reconstruction-Skill change, also perform at least one fresh run from an original raster; unit tests alone do not establish image-extraction quality.

Final runtime integration follows [the acceptance recipe](docs/runtime-integration.md): preserve the normally saved native input, check byte stability and ownership, run complete browser/benchmark regressions and inspect actual engine rendering. Distinguish real-house coverage, authored complex-scene coverage and platform/manual checks in the evidence.

## Agent development workflow

Keep implementation, validation and commits local by default. Do not push, open/update
PRs or merge unless the user explicitly asks. Read-only fetching/research is allowed.
Complete an architecture milestone and its relevant local checks before reporting it.
