extends Node3D

const RUNTIME_ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const RUNTIME_LOADER := preload("res://scripts/runtime_loader.gd")
const RUNTIME_ASSET_RENDERER := preload("res://scripts/runtime_asset_renderer.gd")
const RUNTIME_PROXY_RENDERER := preload("res://scripts/runtime_proxy_renderer.gd")
const RUNTIME_LAUNCHER := preload("res://scripts/runtime_launcher.gd")
const RUNTIME_PLAN_VIEW := preload("res://scripts/runtime_plan_view.gd")
const LAYOUT_SESSION := preload("res://scripts/layout_session.gd")
const LAYOUT_CAMERA := preload("res://scripts/layout_camera.gd")

enum ViewMode { WALKTHROUGH, PLAN }

var _world: Node3D
var _launcher
var _spawn: Vector3
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

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	get_tree().auto_accept_quit = false
	_session = LAYOUT_SESSION.new()
	add_child(_session)
	_discard = ConfirmationDialog.new()
	_discard.dialog_text = "Discard unsaved furniture layout changes?"
	_discard.ok_button_text = "Discard changes"
	_discard.confirmed.connect(func(): _pending_action.call())
	add_child(_discard)
	_launcher = RUNTIME_LAUNCHER.new()
	add_child(_launcher)
	_launcher.scene_selected.connect(func(path: String): _request_action(func():
		if _open_scene(path):
			_session.clear()
			_sync_editor()))
	_launcher.project_selected.connect(func(path: String): _request_action(_open_project.bind(path)))
	_launcher.resume_requested.connect(_resume)
	_launcher.respawn_requested.connect(_return_to_start)
	var artifacts := RUNTIME_ARTIFACTS.new()
	var runtime_path := artifacts.runtime_path_from_args()
	if runtime_path.is_empty():
		_show_menu()
	else:
		_open_scene(runtime_path, artifacts.architecture_path_from_args(runtime_path))

func _open_scene(runtime_path: String, architecture_path: String = "") -> bool:
	var artifacts := RUNTIME_ARTIFACTS.new()
	if architecture_path.is_empty():
		architecture_path = artifacts.default_architecture_path(runtime_path)
	var data := artifacts.load_runtime(runtime_path)
	if data.is_empty():
		_show_menu("Could not open this compiled runtime scene.\nExport a runtime scene from Plan2World and select its runtime JSON.\n%s" % runtime_path)
		return false
	var spawn = _choose_spawn(data)
	if spawn == null:
		_show_menu("Runtime scene has no compiled player spawn. Re-export after setting a valid spawn in the authoring project.")
		return false
	_spawn = spawn
	_runtime_data = data
	_collider_nodes = {}
	_furniture_collider_ids = []
	_furniture_root = null
	_layout_camera = null

	# Validate before replacing a running scene, so a failed open can be resumed.
	if _world != null:
		remove_child(_world)
		_world.queue_free()
	_world = Node3D.new()
	_world.name = "RuntimeScene"
	_world.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(_world)
	_build_environment()

	var architecture_scene = artifacts.load_architecture(architecture_path)
	var presentation_loaded := architecture_scene != null
	if presentation_loaded:
		_world.add_child(architecture_scene)

	var loader := RUNTIME_LOADER.new()
	var furniture_ids := {}
	for entity in data["entities"]:
		if entity["kind"] == "furniture":
			furniture_ids[entity["id"]] = true
	var static_data := data.duplicate()
	static_data["entities"] = data["entities"].filter(func(entity): return entity["kind"] != "furniture")
	static_data["colliders"] = data["colliders"].filter(func(collider): return not furniture_ids.has(collider["ownerId"]))
	var build_result := loader.build(static_data, _world)
	_collider_nodes = build_result["collider_nodes"]
	var assets := artifacts.load_assets(runtime_path)
	var asset_renderer := RUNTIME_ASSET_RENDERER.new()
	var asset_result := asset_renderer.render(static_data, _world, build_result, assets)
	var proxy_renderer := RUNTIME_PROXY_RENDERER.new()
	var presentation_stats := proxy_renderer.render(static_data, _world, build_result, presentation_loaded, asset_result.get("presented", {}))
	var runtime_stats: Dictionary = build_result.get("stats", {})
	var furniture_result := _render_furniture(data, assets)
	runtime_stats["entity_count"] += furniture_ids.size()
	runtime_stats["static_collider_count"] += _furniture_collider_ids.size()

	var player := P2WPlayer.new()
	player.name = "Player"
	_world.add_child(player)
	player.configure(data.get("playerProfile", {}), spawn)
	_layout_camera = LAYOUT_CAMERA.new()
	_world.add_child(_layout_camera)
	_layout_camera.configure(data, _collider_nodes, _furniture_models, player)
	_plan_view = RUNTIME_PLAN_VIEW.new()
	_world.add_child(_plan_view)
	_plan_view.configure(data, _layout_camera)
	_layout_camera.view_started.connect(_sync_controls)
	_layout_camera.view_settled.connect(_sync_controls)
	_plan_view.walkthrough_requested.connect(_show_walkthrough)
	_plan_view.command_requested.connect(_edit_layout)
	_plan_view.undo_requested.connect(func(): _apply_layout_revision(_session.undo()))
	_plan_view.redo_requested.connect(func(): _apply_layout_revision(_session.redo()))
	_plan_view.save_requested.connect(_save_layout)
	_plan_view.export_requested.connect(func(path: String):
		var error: Error = _session.export_runtime(path)
		_plan_view.show_message("Runtime scene exported." if error == OK else "Could not export the runtime scene: " + error_string(error)))
	_view_mode = ViewMode.WALKTHROUGH
	var presentation_status := architecture_path if presentation_loaded else "runtime proxy fallback"
	var notes: PackedStringArray = []
	if not presentation_loaded:
		notes.append("Architecture GLB missing/unreadable; showing compatibility proxies.")
	elif int(presentation_stats.get("collider_proxy_count", 0)) > 0:
		notes.append("Some model assets are missing; showing fallback proxies.")
	var unsupported := 0
	for entity in data["entities"]:
		if (entity["kind"] == "door" and entity["interaction"]["kind"] == "unsupported") or (entity["kind"] == "stair" and entity["traversal"]["kind"] == "unsupported"):
			unsupported += 1
	if unsupported > 0:
		notes.append("%d unsupported door/stair interaction(s); see scene export notes." % unsupported)
	_show_status(
		"WASD move · Ctrl slow · Shift fast · E door · F2 top view · F1 menu\nProject: %s" % str(data["source"]["projectName"]) + ("\n" + "\n".join(notes) if not notes.is_empty() else ""),
	)
	_resume()
	_sync_editor()
	print("Plan2World runtime loaded: ", runtime_path, " architecture=", presentation_status,
		" runtime=", runtime_stats, " assets=", asset_result.get("presented", {}).size() + int(furniture_result["asset_count"]), " presentation=", presentation_stats)
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
	_open_scene(str(result["runtimePath"]))
	_view_mode = ViewMode.PLAN
	_resume()
	_sync_editor()

func _edit_layout(command: Dictionary) -> void:
	if _session.busy:
		return
	_plan_view.set_editor(_session.current(), true, false, false, _session.is_dirty())
	_launcher.set_busy(true)
	var result: Dictionary = await _session.apply_command(command)
	_launcher.set_busy(false)
	if result.get("ok", false):
		var candidate: Dictionary = RUNTIME_ARTIFACTS.new().load_runtime(str(result["runtimePath"]))
		var id := "" if result.get("selectedId") == null else str(result["selectedId"])
		if not id.is_empty() and not _layout_camera.placement_allowed(candidate, id):
			_layout_camera.cancel_drag()
			_session.discard_revision(result)
			_sync_editor()
			_plan_view.show_message("Furniture overlaps an obstacle.")
			return
		_session.commit_revision(result)
		_apply_layout_revision(result)
	else:
		_layout_camera.cancel_drag()
		_sync_editor()
		_plan_view.show_message(str(result["error"]))

func _apply_layout_revision(revision: Dictionary) -> void:
	if revision.is_empty():
		return
	var artifacts := RUNTIME_ARTIFACTS.new()
	var data: Dictionary = artifacts.load_runtime(str(revision["runtimePath"]))
	_render_furniture(data, artifacts.load_assets(str(revision["runtimePath"])))
	_runtime_data = data
	_spawn = _choose_spawn(data)
	_layout_camera.refresh(data, _collider_nodes, _furniture_models)
	_layout_camera.selected_id = "" if revision.get("selectedId") == null else str(revision["selectedId"])
	_sync_editor()

func _render_furniture(data: Dictionary, assets: Dictionary) -> Dictionary:
	if _furniture_root != null:
		_world.remove_child(_furniture_root)
		_furniture_root.queue_free()
	for id in _furniture_collider_ids:
		_collider_nodes.erase(id)
	_furniture_root = Node3D.new()
	_furniture_root.name = "FurnitureLayout"
	_world.add_child(_furniture_root)
	var entities: Array = data["entities"].filter(func(entity): return entity["kind"] == "furniture")
	var ids := {}
	for entity in entities:
		ids[entity["id"]] = true
	var furniture := { "entities": entities, "colliders": data["colliders"].filter(func(collider): return ids.has(collider["ownerId"])), "floors": [] }
	var built: Dictionary = RUNTIME_LOADER.new().build(furniture, _furniture_root)
	var presented: Dictionary = RUNTIME_ASSET_RENDERER.new().render(furniture, _furniture_root, built, assets)
	var proxy: Dictionary = RUNTIME_PROXY_RENDERER.new().render(furniture, _furniture_root, built, true, presented["presented"])
	_furniture_models = presented["instances"].duplicate()
	_furniture_models.merge(proxy["instances"])
	_furniture_collider_ids = built["collider_nodes"].keys()
	_collider_nodes.merge(built["collider_nodes"], true)
	return { "asset_count": presented["presented"].size() }

func _sync_editor() -> void:
	_plan_view.set_editor(_session.current(), _session.busy or _layout_camera.transitioning, _session.index > 0, _session.index + 1 < _session.history.size(), _session.is_dirty())

func _sync_controls() -> void:
	var walking: bool = not _menu_open and _view_mode == ViewMode.WALKTHROUGH and not _layout_camera.transitioning
	var player := _world.get_node("Player") as P2WPlayer
	player.set_physics_process(walking)
	player.set_process_unhandled_input(walking)
	_layout_camera.set_process_unhandled_input(not _menu_open)
	if not _menu_open:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if walking else Input.MOUSE_MODE_VISIBLE
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
	_world.get_node("Player").respawn(_spawn)
	_show_walkthrough()

func _resume() -> void:
	if _session.busy:
		return
	_launcher.hide_menu()
	_menu_open = false
	var plan := _view_mode == ViewMode.PLAN
	_plan_view.visible = plan
	_world.get_node("HUD").visible = not plan
	get_tree().paused = false
	_layout_camera.set_plan_mode(plan)
	_sync_controls()

func _choose_spawn(data: Dictionary):
	for floor in data.get("floors", []):
		var point = floor.get("walkthroughStart", null)
		if typeof(point) == TYPE_ARRAY and point.size() == 3:
			return Vector3(float(point[0]), float(point[1]), float(point[2]))
	return null

func _build_environment() -> void:
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
	_world.add_child(world)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_energy = 1.15
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 40.0
	_world.add_child(sun)

func _show_status(text: String) -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	_world.add_child(layer)
	var panel := ColorRect.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	panel.offset_left = 16
	panel.offset_right = -16
	panel.offset_top = 16
	panel.offset_bottom = 16 + 20 + text.get_slice_count("\n") * 22
	panel.color = Color(0.05, 0.06, 0.08, 0.78)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(panel)
	var label := Label.new()
	label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label.offset_left = 12
	label.offset_right = -12
	label.offset_top = 9
	label.offset_bottom = -9
	label.text = text
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.modulate = Color("f8fafc")
	panel.add_child(label)
	var crosshair := Label.new()
	crosshair.text = "+"
	crosshair.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	crosshair.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-10, -12)
	crosshair.size = Vector2(20, 24)
	crosshair.modulate = Color(1, 1, 1, 0.9)
	layer.add_child(crosshair)
	var top_view := Button.new()
	top_view.name = "TopView"
	top_view.text = "Top view (F2)"
	top_view.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	top_view.offset_left = -172
	top_view.offset_right = -24
	top_view.offset_top = 24
	top_view.offset_bottom = 64
	top_view.pressed.connect(func():
		_view_mode = ViewMode.PLAN
		_release_actions()
		_resume())
	layer.add_child(top_view)
