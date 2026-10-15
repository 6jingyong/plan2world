from pathlib import Path


def patch(path_name: str, replacements: list[tuple[str, str]]) -> None:
    path = Path(path_name)
    text = path.read_text()
    for old, new in replacements:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'{path_name}: expected exactly one match, found {count}: {old[:160]!r}')
        text = text.replace(old, new, 1)
    path.write_text(text)


patch('src/lib/components/FloorPlanImageDialog.svelte', [
    (
        "  const review = $derived(draft ? summarizePlan2WorldDraft(draft) : null);\n"
        "  const focusedIssueElementIds = $derived.by(() => {\n"
        "    if (!review || !focusedIssueKey) return [];\n"
        "    return review.geometryIssues.find(issue => geometryIssueKey(issue) === focusedIssueKey)?.elementIds ?? [];\n"
        "  });\n",
        "  const review = $derived(draft ? summarizePlan2WorldDraft(draft) : null);\n"
        "  const focusedIssue = $derived.by(() => {\n"
        "    if (!review || !focusedIssueKey) return null;\n"
        "    return review.geometryIssues.find(issue => geometryIssueKey(issue) === focusedIssueKey) ?? null;\n"
        "  });\n"
        "  const focusedIssueElementIds = $derived.by(() => focusedIssue?.elementIds ?? []);\n",
    ),
    (
        "      oncreated();\n"
        "      await goto(`${base}/editor?id=${encodeURIComponent(project.id)}`);\n",
        "      oncreated();\n"
        "      const params = new URLSearchParams({ id: project.id });\n"
        "      if (focusedIssue) {\n"
        "        params.set('focusFloor', focusedIssue.floorId);\n"
        "        for (const elementId of focusedIssue.elementIds) params.append('focus', elementId);\n"
        "      }\n"
        "      await goto(`${base}/editor?${params.toString()}`);\n",
    ),
    (
        "        {busy ? 'Opening…' : 'Open editable home'}\n",
        "        {busy ? 'Opening…' : focusedIssue ? 'Open editable home at finding' : 'Open editable home'}\n",
    ),
])


patch('src/routes/editor/+page.svelte', [
    (
        "  import { currentProject, viewMode, selectedElementId, selectedRoomId, createDefaultProject, loadProject, selectedTool, placingFurnitureId, elevationWallId, elevationPickMode } from '$lib/stores/project';\n",
        "  import { currentProject, viewMode, selectedElementId, selectedElementIds, selectedRoomId, createDefaultProject, loadProject, setActiveFloor, selectedTool, placingFurnitureId, elevationWallId, elevationPickMode } from '$lib/stores/project';\n"
        "  import { editorFocusRequest } from '$lib/stores/editorFocus';\n"
        "  import { resolveReviewFocus } from '$lib/plan2world/reviewFocus';\n",
    ),
    (
        "  async function initializeEditor() {\n",
        "  function applyReviewFocus(url: URL) {\n"
        "    const hasFocus = url.searchParams.has('focusFloor') || url.searchParams.has('focus');\n"
        "    if (!hasFocus) return;\n"
        "    const project = get(currentProject);\n"
        "    const target = project\n"
        "      ? resolveReviewFocus(project, url.searchParams.get('focusFloor'), url.searchParams.getAll('focus'))\n"
        "      : null;\n"
        "    url.searchParams.delete('focusFloor');\n"
        "    url.searchParams.delete('focus');\n"
        "    if (target) {\n"
        "      setActiveFloor(target.floorId);\n"
        "      selectedTool.set('select');\n"
        "      selectedRoomId.set(null);\n"
        "      selectedElementIds.set(target.elementIds.length > 1 ? new Set(target.elementIds) : new Set());\n"
        "      selectedElementId.set(target.primaryId);\n"
        "      editorFocusRequest.set(target);\n"
        "    }\n"
        "    replaceState(`${url.pathname}${url.search}${url.hash}`, page.state);\n"
        "  }\n\n"
        "  async function initializeEditor() {\n",
    ),
    (
        "        if (pending?.id === id && get(saveState) !== 'saved') { ready = true; return; }\n",
        "        if (pending?.id === id && get(saveState) !== 'saved') {\n"
        "          applyReviewFocus(new URL(window.location.href));\n"
        "          ready = true;\n"
        "          return;\n"
        "        }\n",
    ),
    (
        "      ready = true;\n"
        "    } catch (error) {\n",
        "      applyReviewFocus(new URL(window.location.href));\n"
        "      ready = true;\n"
        "    } catch (error) {\n",
    ),
])


patch('src/lib/components/editor/FloorPlanCanvas.svelte', [
    (
        "  import { hasOpenModal } from '$lib/utils/modalDialog';\n",
        "  import { hasOpenModal } from '$lib/utils/modalDialog';\n"
        "  import { editorFocusRequest } from '$lib/stores/editorFocus';\n",
    ),
    (
        "    const unsub_multi = selectedElementIds.subscribe((ids) => { currentSelectedIds = ids; markDirty(); });\n"
        "    const unsub_elevopen = elevationWallId.subscribe((id) => { elevationOpen = !!id; markDirty(); });\n",
        "    const unsub_multi = selectedElementIds.subscribe((ids) => { currentSelectedIds = ids; markDirty(); });\n"
        "    const unsub_focus = editorFocusRequest.subscribe((request) => {\n"
        "      if (!request || !currentFloor || request.floorId !== currentFloor.id) return;\n"
        "      // Prevent the queued whole-plan initial fit from overriding this one-shot handoff.\n"
        "      initialFitDone = true;\n"
        "      requestAnimationFrame(() => {\n"
        "        if (!mounted || !currentFloor || request.floorId !== currentFloor.id) return;\n"
        "        zoomToFit(true);\n"
        "        editorFocusRequest.set(null);\n"
        "      });\n"
        "    });\n"
        "    const unsub_elevopen = elevationWallId.subscribe((id) => { elevationOpen = !!id; markDirty(); });\n",
    ),
    (
        "unsub13(); unsub_multi(); unsub_elevopen(); unsub_elevpick(); unsub14();",
        "unsub13(); unsub_multi(); unsub_focus(); unsub_elevopen(); unsub_elevpick(); unsub14();",
    ),
])
