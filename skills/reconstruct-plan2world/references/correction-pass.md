# Annotated Godot correction

The user prefers source problems to remain visible as review notes and to correct
walls/openings manually in Godot. Keep one architectural observation and one
furniture observation. Run preflight and retain its failure, but a source-data
failure may continue to the original furniture-only observation. Freeze both;
do not ask the model to repair the architecture or rewrite either record.

With both files frozen, use the shared authoring handoff in a new directory:

```sh
NODE_ENV=production node tooling/correct-plan2world-source.mjs \
  --architecture "$RUN_DIR/source-architecture.json" \
  --furnishing "$RUN_DIR/source-furnishing.json" \
  --source original.jpg --output "$RUN_DIR/correction"
```

This reads frozen observations; it does not call a provider. Literal coordinates
and the existing shared-point transport are accepted. For a confirmed transformed
image, pass its working raster and `--preparation preparation-evidence.json`;
the original-image evidence and working-image hash must match.

Deliver `project.json` with the source image and located authoring review notes.
Unapplied openings stay notes rather than invented geometry. A malformed record
must not erase other individually usable walls. Complete originals remain in
the Project's review evidence. A marked note is a user acknowledgement, never a
source accuracy certificate. Keep source failures and audits; do not label an
annotated output a strict source pass.

Open it with **Correct walls and openings…** in Godot. Native wall IDs already
provide editable segments; programs own explicit splitting and reference updates.
Users may draw/move/delete walls, add/rehost openings and select the entrance,
then save a separate authored Project. The strict runtime compiler still checks
floor support, opening geometry and entry before applying a new world. Do not
add a floor or relocate a player merely to allow walkthrough.

Door observation concerns aperture extent and visible operation. Wood, glass or
metal appearance is chosen later in walkthrough with **M** and does not change
door motion or physics. Keep unsupported or uncertain motion explicit.
