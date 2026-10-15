from pathlib import Path

path = Path('src/lib/components/viewer3d/ThreeViewer.svelte')
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, found {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)


replace_once(
    "  import { frameScene } from '$lib/utils/frameScene';\n",
    "  import { frameScene } from '$lib/utils/frameScene';\n"
    "  import { ARCHITECTURAL_CUT_HEIGHT_CM, architecturalCutPlanes } from '$lib/utils/architecturalCut';\n",
)

replace_once(
    "  // Multi-floor stacking\n"
    "  let showAllFloors = $state(false);\n"
    "  let activeFloorElevation = $state(0);\n",
    "  // Multi-floor stacking\n"
    "  let showAllFloors = $state(false);\n"
    "  // Architectural plan view: the live 3D scene clipped at a conventional 1.20 m.\n"
    "  let architecturalCutMode = $state(false);\n"
    "  let activeFloorElevation = $state(0);\n",
)

replace_once(
    "    renderer.toneMappingExposure = 1.2;\n"
    "    renderer.domElement.dataset.plan3dCanvas = 'true';\n"
    "    container.appendChild(renderer.domElement);\n",
    "    renderer.toneMappingExposure = 1.2;\n"
    "    renderer.domElement.dataset.plan3dCanvas = 'true';\n"
    "    applyArchitecturalCut();\n"
    "    container.appendChild(renderer.domElement);\n",
)

replace_once(
    "  function viewTopDown() {\n",
    "  function applyArchitecturalCut() {\n"
    "    renderer.clippingPlanes = architecturalCutPlanes(architecturalCutMode, activeFloorElevation);\n"
    "    if (architecturalCutMode) {\n"
    "      renderer.domElement.dataset.architecturalCut = String(activeFloorElevation + ARCHITECTURAL_CUT_HEIGHT_CM);\n"
    "    } else {\n"
    "      delete renderer.domElement.dataset.architecturalCut;\n"
    "    }\n"
    "  }\n\n"
    "  function disableArchitecturalCut() {\n"
    "    if (!architecturalCutMode) return;\n"
    "    architecturalCutMode = false;\n"
    "    applyArchitecturalCut();\n"
    "    markSceneDirty();\n"
    "  }\n\n"
    "  function toggleAllFloors() {\n"
    "    if (!showAllFloors) disableArchitecturalCut();\n"
    "    showAllFloors = !showAllFloors;\n"
    "    rebuildScene();\n"
    "  }\n\n"
    "  function toggleArchitecturalCut() {\n"
    "    if (architecturalCutMode) {\n"
    "      disableArchitecturalCut();\n"
    "      return;\n"
    "    }\n"
    "    if (walkthroughMode) exitWalkthroughMode();\n"
    "    if (showAllFloors) {\n"
    "      showAllFloors = false;\n"
    "      rebuildScene();\n"
    "    }\n"
    "    architecturalCutMode = true;\n"
    "    applyArchitecturalCut();\n"
    "    viewTopDown();\n"
    "  }\n\n"
    "  function viewTopDown() {\n",
)

replace_once(
    "  function enterWalkthroughMode() {\n"
    "    cancelAIRender();\n",
    "  function enterWalkthroughMode() {\n"
    "    disableArchitecturalCut();\n"
    "    cancelAIRender();\n",
)

replace_once(
    "      onclick={() => { showAllFloors = !showAllFloors; rebuildScene(); }}\n",
    "      onclick={toggleAllFloors}\n",
)

needle = '''    <!-- Wall Transparency Toggle -->\n'''
button = '''    <!-- Architectural Cut View: same live 3D geometry, clipped at 1.20 m -->\n    <button\n      onclick={toggleArchitecturalCut}\n      aria-pressed={architecturalCutMode}\n      class="min-w-10 px-2 py-2 rounded-lg text-[10px] font-semibold leading-none transition-colors {architecturalCutMode ? 'bg-emerald-600 text-white ring-2 ring-emerald-300' : 'bg-black/70 text-white hover:bg-black/80'}"\n      title={`${$t('viewerNav.top')} · 1.20 m`}\n      aria-label={`${$t('viewerNav.top')} · 1.20 m`}\n    >\n      1.20m\n    </button>\n\n'''
replace_once(needle, button + needle)

path.write_text(text)
