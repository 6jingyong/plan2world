# Offline runtime delivery

The native Project remains editable authoring truth. Delivery uses two independent
ZIPs: a platform-specific **player**, and an engine-neutral **scene**. A scene ZIP
is only transport for existing artifacts; it adds no runtime schema, engine paths
or canonical Godot scene.

## Use a scene

1. In the browser editor, choose **Export → Export runtime scene (.zip)**.
2. Extract the complete scene ZIP. Keep `scene.runtime.json`,
   `scene.architecture.glb` and `scene.assets/` together. `README.txt` records
   missing assets, architecture diagnostics and unsupported interaction semantics.
3. Extract the player ZIP for your platform. Keep the executable and
   `Plan2World.pck` together. Start `Plan2World.exe` on Windows or
   `Plan2World.x86_64` on Linux. No Godot editor or Node.js installation is needed.
4. Choose **Open runtime scene…**, then select the extracted `scene.runtime.json`.
   Native Project JSON and unextracted ZIPs are not runtime input.

Scenes can live anywhere and can be moved independently of the player. The
player uses local files and runs offline. Browser export fetches only referenced
catalog models from the application's own origin; custom-model attachments reuse
the retained Project sources. A failed model request reports an export error and
can be retried. Genuinely absent model sources retain the existing proxy policy.

Controls: WASD move, Ctrl slow, Shift fast, mouse look, E door, Esc release/capture
mouse, F1 scene menu. The menu pauses physics/input. Failed scene opens preserve
the current world so it can be resumed. Opening another scene replaces the old
world, player and HUD. Missing presentation and unsupported interactions are
visible in the HUD as well as export notes.

The renderer defaults to Forward+. For older hardware, start the player with
`--rendering-method gl_compatibility`. Hardware/driver compatibility and visual
acceptance still require testing on the target machine. Windows builds are
unsigned; distribution signing is a separate release step.

## Compile a scene without the browser

```bash
npm run runtime:export -- house.project.json --package house.runtime.zip
```

The original sibling JSON/GLB/assets outputs remain available. The ZIP uses fixed
portable filenames, sorted entries, fixed UTC timestamps and unmodified asset
bytes. The browser and CLI call the same compiler and serializer. Repeated exports
of the same native input and asset sources produce identical scene ZIP bytes.

## Build a player

Install Godot **4.7.2 stable Standard** and the matching official export templates.
Godot's **Editor → Manage Export Templates** works on Windows. On Linux, the
repository installer downloads the official archive, verifies its pinned SHA-512
and extracts only the Windows/Linux desktop release templates:

```bash
bash tooling/install-godot-templates.sh
export GODOT_BIN=/path/to/Godot_v4.7.2-stable_linux.x86_64
npm run runtime:player -- windows /tmp/plan2world-windows
npm run runtime:player -- linux /tmp/plan2world-linux
```

The official all-platform template download is approximately 1.2 GiB. Builds
require a new/empty output directory. Each command emits that directory plus a
sibling `.zip` containing the executable, PCK, instructions and Plan2World/Godot
license notices. On Windows, set `$env:GODOT_BIN` to the installed Godot executable
before running the same npm commands. Player building does not compile or bake
user scenes; the player consumes any compatible separately exported scene.

Optional direct launch:

```powershell
.\Plan2World.exe -- --scene "C:\家居 项目\scene.runtime.json"
```

## Verify delivery

```bash
node tooling/runtime-delivery-test.mjs /tmp/plan2world-linux.zip /tmp/delivery-check
```

With `GODOT_BIN` pointing to the pinned editor, this gate starts from the authored
complex native Project fixture, runs the real scene ZIP exporter, extracts both
ZIPs into relocated paths containing spaces/Chinese characters, then checks:

- exact shipped PCK resources: picker startup, grounded spawn, menu pause/resume,
  rejected native input, failed-open recovery and replacement-world cleanup;
- exact shipped PCK resources: real grounded walking, compiler collision, ray
  interaction with swing/slide/paired doors, furniture/column/wall blockers,
  railing/air and straight stair ascent/descent;
- actual release executable startup with all eight dynamic presentations and no
  missing-asset/static proxies; native source unchanged.

Official release templates disable `--script` and scene path overrides. Physics
and launcher assertions therefore use the pinned Godot editor with the **exported
PCK**, followed by a separate boot of the **release executable**. Tests do not ship
inside the player and production code has no test execution switch. This gate
does not claim Windows hardware acceptance. Core CI also builds the Windows
release ZIP; Windows Forward+ graphics and manual input remain a target-machine
acceptance step.
