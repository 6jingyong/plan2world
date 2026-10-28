# Native door panels

Existing Projects keep their previous single-slider/equal-pair defaults. The
internal browser's door properties and desktop **Doors…** dialog edit an optional
native `Door.leafConfiguration`. These are explicit author settings, never an
observation result or automatic multi-track inference.

`paired` stores `firstLeafRatio` (strictly between 0 and 1) for double/French
doors. `sliding` stores stable panel IDs, width, closed centre, track offset,
fixed/slide motion and signed travel. Lengths are native centimetres. Centres and
travel follow the opening chord A→B; positive track points toward its left normal.
On curved walls, widths/closed centres fit the physical aperture chord; track and
travel remain physical centimetres. Panel thickness is the existing 4cm default.

Author presets cover two-panel/one-fixed, three-track telescoping, four-panel
centre opening and a single pocket panel. A preset changes a pending form only;
Apply commits through the shared native validator. Panels must cover the closed
aperture, fit within its ends and avoid closed positive-volume overlap. At least
one must move. Conflicting motion remains physically blocked instead of repaired.
Reset explicitly restores the legacy default.
An explicit aperture-width edit scales panel widths, closed centres and travel
together; track offsets remain physical. Host reversal preserves physical panels.

For explicitly configured doors, internal 3D Review draws the shared compiler's
closed parts, including unequal widths and track offsets, on both the active and
stacked floors. This is a read-only geometry preview; interaction and obstruction
remain Godot responsibilities.

Runtime slide parts retain explicit axis/travel. Fixed parts additionally carry
`fixed: true`, zero travel and a zero axis, with a real independent collider and
asset. Configured sliders emit `allowHostOverlap: false`; pocket panels explicitly
permit passage inside their own host. Legacy sliders preserve their previous
host exemption. Neighbouring walls, furniture and actors remain obstacles.

Godot compares moving panels at the same candidate time and keeps fixed panels
in the world query. Translation uses swept queries and rotation is subdivided.
Queries retain the prior 0.999 contact-size tolerance; connected swinging slabs
have a 1mm seam comparison tolerance. Actual collision bodies are unchanged.
Either fixed or moving leaf targets the shared door interaction.

Desktop configuration edits compile and stage a candidate before replacing only
that door assembly. Architecture, player, camera and other doors retain their
nodes/state. An overlapping closed candidate, invalid configuration or failed
compilation retains the accepted Project/world. There is no product edit history.
JSON and native Project package round trips retain the configuration. Existing
compiled snapshots should be re-exported for the new fixed-panel contract.

Authored mechanism coverage is in `tooling/runtime-multileaf-fixture.mjs` and
`runtime_multileaf_test.gd`: full motion, thin-neighbour/fixed/moving/player
obstruction, actual grounded player passage and native dialog/candidate rejection.
This does not establish YJ215 source accuracy. Its private Project is absent in
this new checkout and must be recovered before real-case revalidation.
