extends Node3D

const UI := preload("res://scripts/runtime_ui.gd")
const RUNTIME_ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const RUNTIME_LOADER := preload("res://scripts/runtime_loader.gd")
const RUNTIME_ASSET_RENDERER := preload("res://scripts/runtime_asset_renderer.gd")
const RUNTIME_PROXY_RENDERER := preload("res://scripts/runtime_proxy_renderer.gd")
const RUNTIME_LAUNCHER := preload("res://scripts/runtime_launcher.gd")
const RUNTIME_PLAN_VIEW := preload("res://scripts/runtime_plan_view.gd")
const LAYOUT_SESSION := preload("res://scripts/layout_session.gd")
const FURNITURE_ADJUSTMENT := preload("res://scripts/furniture_adjustment.gd")
const LAYOUT_CAMERA := preload("res://scripts/layout_camera.gd")

enum ViewMode { WALKTHROUGH, PLAN }

var _world: Node3D
var _launcher
var _spawn: Vector3
var _spawn_yaw = null
var _adjustment
var _editing := false
var _plan_view
var _view_mode := ViewMode.WALKTHROUGH
var _menu_open := false
var _session
var _runtime_data: Dictionary
var _collider_nodes: Dictionary
var _furniture_root: Node3D
var _furniture_models: Dictionary
var _layout_camera
var _furniture_collider_ids: Array = []
var _discard: ConfirmationDialog
var _pending_action: Callable
var _scene_notes := PackedStringArray()
var _static_assets_missing := false
var _furniture_fallbacks := 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	get_tree().auto_accept_quit = false
	_session = LAYOUT_SESSION.new()
	add_child(_session)
	_discard = ConfirmationDialog.new()
	_discard.theme = UI.theme()
	_discard.dialog_text = "Discard unsaved furniture layout changes?"
	_discard.ok_button_text = "Discard changes"
	_discard.confirmed.connect(func(): _pending_action.call())
	add_child(_discard)
	_launcher = RUNTIME_LAUNCHER.new()
	add_child(_launcher)
	_launcher.scene_selected.connect(func(path: String): _request_action(_open_scene.bind(path)))
	_launcher.project_selected.connect(func(path: String): _request_action(_open_project.bind(path)))
	_launcher.resume_requested.connect(_resume)
	_launcher.respawn_requested.connect(_return_to_start)
	var artifacts := RUNTIME_ARTIFACTS.new()
	var runtime_path := artifacts.runtime_path_from_args()
	if runtime_path.is_empty():
		_show_menu()
	else:
		_open_scene(runtime_path, artifacts.architecture_path_from_args(runtime_path))

func _open_scene(runtime_path: String, architecture_path: String = "", editor_state: Dictionary = {}) -> bool:
	var artifacts := RUNTIME_ARTIFACTS.new()
	if architecture_path.is_empty():
		architecture_path = artifacts.default_architecture_path(runtime_path)
	var data := artifacts.load_runtime(runtime_path)
	if data.is_empty():
		_show_menu("Could not open this compiled runtime scene.\nExport a runtime scene from Plan2World and select its runtime JSON.\n%s" % runtime_path)
		return false
	if not artifacts.architecture_matches(data, architecture_path):
		_show_menu("The architecture GLB belongs to a different export. Open the complete matching scene package.")
		return false
	var spawn = _choose_spawn(data)
	if spawn == null:
		_show_menu("Runtime scene has no compiled player spawn. Re-export after setting a valid spawn in the authoring project.")
		return false
	# Resources and node construction stay outside the active SceneTree. A
	# candidate cannot render, collide or consume input before this commit.
	var stage := _stage_world(data, artifacts, runtime_path, architecture_path)
	if stage.is_empty():
		_show_menu("Could not build the runtime scene; the previous world is retained.")
		return false
	var previous := _world
	if previous != null:
		remove_child(previous)
	_world = stage["world"]
	_world.name = "RuntimeScene"
	_world.process_mode = Node.PROCESS_MODE_PAUSABLE
	_spawn = spawn
	_spawn_yaw = _spawn_floor(data).get("walkthroughYawClockwiseRadians")
	_runtime_data = data
	_collider_nodes = stage["colliders"]
	_furniture_root = stage["furniture"]["root"]
	_furniture_models = stage["furniture"]["models"]
	_furniture_collider_ids = stage["furniture"]["colliders"].keys()
	add_child(_world)
	var presentation_loaded: bool = stage["presentation_loaded"]
	var presentation_stats: Dictionary = stage["presentation_stats"]
	var runtime_stats: Dictionary = stage["runtime_stats"]
	var asset_count: int = stage["asset_count"]
	var player := P2WPlayer.new()
	player.name = "Player"
	_world.add_child(player)
	player.configure(data.get("playerProfile", {}), spawn, _spawn_yaw)
	_layout_camera = LAYOUT_CAMERA.new()
	_world.add_child(_layout_camera)
	_layout_camera.configure(data, _collider_nodes, _furniture_models, player)
	_adjustment = FURNITURE_ADJUSTMENT.new()
	_world.add_child(_adjustment)
	_adjustment.configure(_layout_camera, player)
	_adjustment.state_changed.connect(_sync_controls)
	_adjustment.message.connect(_layout_message)
	_plan_view = RUNTIME_PLAN_VIEW.new()
	_world.add_child(_plan_view)
	_plan_view.configure(data, _layout_camera)
	_layout_camera.view_started.connect(_sync_controls)
	_layout_camera.view_settled.connect(_sync_controls)
	_plan_view.walkthrough_requested.connect(_show_walkthrough)
	_plan_view.menu_requested.connect(_show_menu)
	_plan_view.command_requested.connect(_edit_layout)
	_plan_view.save_requested.connect(_save_layout)
	_plan_view.export_requested.connect(func(path: String):
		var error: Error = _session.export_runtime(path)
		_plan_view.show_message("Runtime scene exported." if error == OK else "Could not export the runtime scene: " + error_string(error)))
	_view_mode = ViewMode.WALKTHROUGH
	var presentation_status := architecture_path if presentation_loaded else "runtime proxy fallback"
	var notes: PackedStringArray = []
	if not presentation_loaded:
		notes.append("Architecture GLB missing/unreadable; showing compatibility proxies.")
	_furniture_fallbacks = stage["furniture"]["proxy_count"]
	_static_assets_missing = presentation_loaded and int(presentation_stats.get("collider_proxy_count", 0)) > _furniture_fallbacks
	var unsupported := 0
	for entity in data["entities"]:
		if (entity["kind"] == "door" and entity["interaction"]["kind"] == "unsupported") or (entity["kind"] == "stair" and entity["traversal"]["kind"] == "unsupported"):
			unsupported += 1
	if unsupported > 0:
		notes.append("%d unsupported door/stair interaction(s); see scene export notes." % unsupported)
	_scene_notes = notes
	_show_status(str(data["source"]["projectName"]))
	_update_asset_notice()
	if editor_state.is_empty(): _session.clear()
	else: _session.accept(editor_state, true)
	if previous != null:
		previous.queue_free()
	_resume()
	_sync_editor()
	print("Plan2World runtime loaded: ", runtime_path, " architecture=", presentation_status,
		" runtime=", runtime_stats, " assets=", asset_count, " presentation=", presentation_stats)
	return true

func _request_action(action: Callable) -> void:
	if _session.busy:
		return
	if _session.is_dirty():
		_pending_action = action
		_show_menu()
		_discard.popup_centered()
	else:
		action.call()

func _open_project(path: String) -> void:
	_show_menu("Opening Project…")
	_launcher.set_busy(true)
	var result: Dictionary = await _session.open_project(path)
	_launcher.set_busy(false)
	if not result.get("ok", false):
		_show_menu(str(result["error"]))
		return
	if not _open_scene(str(result["runtimePath"]), "", result):
		_session.discard_candidate(result)
		return
	_view_mode = ViewMode.PLAN
	_resume()
	_sync_editor()

func _edit_layout(command: Dictionary) -> void:
	if _session.busy or _editing:
		return
	_layout_message("")
	_editing = true
	_sync_controls()
	_plan_view.set_editor(_session.current(), true, _session.is_dirty())
	_launcher.set_busy(true)
	var result: Dictionary = await _session.apply_command(command)
	_launcher.set_busy(false)
	_editing = false
	if result.get("ok", false):
		var candidate: Dictionary = RUNTIME_ARTIFACTS.new().load_runtime(str(result["runtimePath"]))
		var id := "" if result.get("selectedId") == null else str(result["selectedId"])
		if candidate.is_empty() or (not id.is_empty() and not _layout_camera.placement_allowed(candidate, id)):
			_layout_camera.cancel_drag()
			_session.discard_candidate(result)
			_sync_controls()
			_layout_message("Furniture overlaps an obstacle.")
			return
		_apply_layout_state(result, candidate)
		_session.accept(result)
		_sync_controls()
	else:
		_layout_camera.cancel_drag()
		_sync_controls()
		_layout_message(str(result["error"]))

func _apply_layout_state(state: Dictionary, data: Dictionary) -> void:
	var artifacts := RUNTIME_ARTIFACTS.new()
	_render_furniture(data, artifacts.load_assets(str(state["runtimePath"])))
	_runtime_data = data
	_spawn = _choose_spawn(data)
	_spawn_yaw = _spawn_floor(data).get("walkthroughYawClockwiseRadians")
	_layout_camera.refresh(data, _collider_nodes, _furniture_models)
	_layout_camera.selected_id = "" if state.get("selectedId") == null else str(state["selectedId"])
	_sync_editor()

func _stage_world(data: Dictionary, artifacts, runtime_path: String, architecture_path: String) -> Dictionary:
	var world := Node3D.new()
	_build_environment(world)
	var architecture = artifacts.load_architecture(architecture_path)
	if architecture != null:
		world.add_child(architecture)
	var ids := {}
	for entity in data["entities"]:
		if entity["kind"] == "furniture": ids[entity["id"]] = true
	var static_data := data.duplicate()
	static_data["entities"] = data["entities"].filter(func(entity): return entity["kind"] != "furniture")
	static_data["colliders"] = data["colliders"].filter(func(collider): return not ids.has(collider["ownerId"]))
	var built: Dictionary = RUNTIME_LOADER.new().build(static_data, world)
	var assets: Dictionary = artifacts.load_assets(runtime_path)
	var presented: Dictionary = RUNTIME_ASSET_RENDERER.new().render(static_data, world, built, assets)
	var stats: Dictionary = RUNTIME_PROXY_RENDERER.new().render(static_data, world, built, architecture != null, presented["presented"])
	var furniture := _build_furniture(data, assets, world)
	var colliders: Dictionary = built["collider_nodes"]
	colliders.merge(furniture["colliders"])
	if colliders.size() != data["colliders"].size():
		world.free()
		return {}
	stats["collider_proxy_count"] += furniture["proxy_count"]
	built["stats"]["entity_count"] += ids.size()
	built["stats"]["static_collider_count"] += furniture["colliders"].size()
	return { "world": world, "colliders": colliders, "furniture": furniture, "presentation_loaded": architecture != null, "presentation_stats": stats, "runtime_stats": built["stats"], "asset_count": presented["presented"].size() + furniture["asset_count"] }

func _build_furniture(data: Dictionary, assets: Dictionary, world: Node3D) -> Dictionary:
	var group := Node3D.new()
	group.name = "FurnitureLayout"
	world.add_child(group)
	var entities: Array = data["entities"].filter(func(entity): return entity["kind"] == "furniture")
	var ids := {}
	for entity in entities:
		ids[entity["id"]] = true
	var furniture := { "entities": entities, "colliders": data["colliders"].filter(func(collider): return ids.has(collider["ownerId"])), "floors": [] }
	var built: Dictionary = RUNTIME_LOADER.new().build(furniture, group)
	var presented: Dictionary = RUNTIME_ASSET_RENDERER.new().render(furniture, group, built, assets)
	var proxy: Dictionary = RUNTIME_PROXY_RENDERER.new().render(furniture, group, built, true, presented["presented"])
	var models: Dictionary = presented["instances"].duplicate()
	models.merge(proxy["instances"])
	return { "root": group, "colliders": built["collider_nodes"], "models": models, "asset_count": presented["presented"].size(), "proxy_count": proxy["collider_proxy_count"] }

func _render_furniture(data: Dictionary, assets: Dictionary) -> void:
	var next := _build_furniture(data, assets, _world)
	if _furniture_root != null:
		_world.remove_child(_furniture_root)
		_furniture_root.queue_free()
	for id in _furniture_collider_ids:
		_collider_nodes.erase(id)
	_furniture_root = next["root"]
	_furniture_root.name = "FurnitureLayout"
	_furniture_models = next["models"]
	_furniture_collider_ids = next["colliders"].keys()
	_collider_nodes.merge(next["colliders"], true)
	_furniture_fallbacks = next["proxy_count"]
	_update_asset_notice()

func _sync_editor() -> void:
	_plan_view.set_editor(_session.current(), _session.busy or _editing or _layout_camera.transitioning, _session.is_dirty())

func _sync_controls() -> void:
	var walking: bool = not _menu_open and _view_mode == ViewMode.WALKTHROUGH and not _layout_camera.transitioning and not _adjustment.active and not _editing
	var player := _world.get_node("Player") as P2WPlayer
	player.set_physics_process(walking)
	player.set_process_unhandled_input(not _menu_open and _view_mode == ViewMode.WALKTHROUGH and not _layout_camera.transitioning)
	player.interaction_enabled = walking
	_adjustment.set_process_unhandled_input(not _menu_open and not _editing)
	_layout_camera.set_process_unhandled_input(not _menu_open)
	if not _menu_open:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if _view_mode == ViewMode.WALKTHROUGH and not _layout_camera.transitioning else Input.MOUSE_MODE_VISIBLE
	_sync_editor()

func _save_layout(path: String) -> void:
	var error: Error = _session.save_project(path)
	_sync_editor()
	_plan_view.show_message("Project saved." if error == OK else "Could not save Project: " + error_string(error))

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F1:
		if _menu_open and _world != null:
			_resume()
		else:
			_show_menu()
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F2 and not _menu_open and _world != null and not _session.busy:
		if _view_mode == ViewMode.PLAN:
			_show_walkthrough()
		else:
			_view_mode = ViewMode.PLAN
			_release_actions()
			_resume()
		get_viewport().set_input_as_handled()

func _show_walkthrough() -> void:
	if _session.busy:
		return
	_view_mode = ViewMode.WALKTHROUGH
	_release_actions()
	_resume()

func _release_actions() -> void:
	for action in InputMap.get_actions():
		Input.action_release(action)

func _show_menu(message: String = "") -> void:
	get_tree().paused = true
	_menu_open = true
	# A key-up can be lost when the desktop switches windows. Clear action state
	# here so explicit resume cannot replay movement from before the pause.
	_release_actions()
	if _world != null:
		_adjustment.cancel()
		_plan_view.cancel_drag()
		_plan_view.hide()
		_sync_controls()
	_launcher.show_menu(_world != null, message)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and is_node_ready():
		_request_action(func(): get_tree().quit())
		return
	if what == NOTIFICATION_WM_WINDOW_FOCUS_OUT and is_node_ready() and _world != null and not _menu_open:
		if _plan_view.has_open_dialog():
			return
		_show_menu("Session paused while this window was inactive.")

func _return_to_start() -> void:
	_world.get_node("Player").respawn(_spawn, _spawn_yaw)
	_show_walkthrough()

func _resume() -> void:
	if _session.busy:
		return
	_launcher.hide_menu()
	_menu_open = false
	_adjustment.cancel()
	var plan := _view_mode == ViewMode.PLAN
	_plan_view.visible = plan
	_world.get_node("HUD").visible = not plan
	get_tree().paused = false
	_layout_camera.set_plan_mode(plan)
	_sync_controls()

func _spawn_floor(data: Dictionary) -> Dictionary:
	for floor in data["floors"]:
		if floor.has("entranceDoorId"): return floor
	for floor in data["floors"]:
		if floor["walkthroughStart"] != null: return floor
	return {}

func _choose_spawn(data: Dictionary):
	var floor := _spawn_floor(data)
	if floor.is_empty(): return null
	var point: Array = floor["walkthroughStart"]
	return Vector3(point[0],point[1],point[2])

func _layout_message(text: String) -> void:
	if _plan_view != null: _plan_view.show_message(text)
	if _world != null:
		var label := _world.get_node_or_null("HUD/LayoutStatus") as Label
		if label != null:
			label.text = text
			label.visible = not text.is_empty()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventJoypadButton and event.is_action_pressed("view_toggle") and not _menu_open and _world != null and not _editing:
		if _view_mode == ViewMode.PLAN: _show_walkthrough()
		else:
			_view_mode = ViewMode.PLAN
			_release_actions()
			_resume()
		get_viewport().set_input_as_handled()

func _build_environment(target: Node3D) -> void:
	var world := WorldEnvironment.new()
	world.name = "WorldEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("dce6ee")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("fff4e6")
	environment.ambient_light_energy = 0.72
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.ssao_enabled = true
	environment.ssao_radius = 1.2
	environment.ssao_intensity = 2.0
	world.environment = environment
	target.add_child(world)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_energy = 1.15
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 40.0
	target.add_child(sun)

func _update_asset_notice() -> void:
	var notes := _scene_notes.duplicate()
	if _static_assets_missing or _furniture_fallbacks > 0:
		notes.append("Some model assets are missing; showing fallback proxies.")
	var label := _world.get_node("HUD/Identity/Content/PresentationNotes") as Label
	label.text = "\n".join(notes)
	label.visible = not notes.is_empty()

func _show_status(project_name: String) -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	_world.add_child(layer)
	var panel := PanelContainer.new()
	panel.name = "Identity"
	panel.theme = UI.theme()
	panel.position = Vector2(20, 20)
	panel.custom_minimum_size = Vector2(300, 0)
	layer.add_child(panel)
	var identity := VBoxContainer.new()
	identity.name = "Content"
	identity.add_theme_constant_override("separation", 3)
	panel.add_child(identity)
	identity.add_child(UI.label("AT HOME  /  EXPLORING", 12, UI.LEAF))
	var title := UI.label(project_name, 21)
	title.custom_minimum_size.x = 280
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	identity.add_child(title)
	var note := UI.label("", 13, UI.AMBER)
	note.name = "PresentationNotes"
	note.custom_minimum_size.x = 280
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	identity.add_child(note)
	UI.ignore_pointer(panel)
	var crosshair := UI.label("·", 30, Color("fffdf5"))
	crosshair.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	crosshair.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-12, -18)
	crosshair.size = Vector2(24, 36)
	crosshair.add_theme_color_override("font_shadow_color", UI.INK)
	crosshair.add_theme_constant_override("shadow_outline_size", 3)
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(crosshair)
	var help := UI.label("WASD  Wander     E  Open door     F  Adjust a piece     F2  Arrange     F1  Pause", 14)
	help.add_theme_stylebox_override("normal", UI.box(UI.PAPER, 16, 14, true))
	help.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	help.offset_left = 20; help.offset_top = -64; help.offset_bottom = -20
	help.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(help)
	var status := UI.label("", 15)
	status.name = "LayoutStatus"
	status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	status.offset_top = -156; status.offset_bottom = -80
	status.offset_left = 20; status.offset_right = -20
	status.add_theme_stylebox_override("normal", UI.box(UI.PAPER, 16, 14, true))
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status.hide()
	layer.add_child(status)
	var top_view := UI.button("Arrange  F2", "TopView", func():
		_view_mode = ViewMode.PLAN
		_release_actions()
		_resume(), true)
	top_view.theme = UI.theme()
	top_view.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	top_view.offset_left = -192; top_view.offset_right = -20
	top_view.offset_top = 20; top_view.offset_bottom = 68
	layer.add_child(top_view)
