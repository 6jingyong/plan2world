extends Node3D

const RUNTIME_ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const RUNTIME_LOADER := preload("res://scripts/runtime_loader.gd")
const RUNTIME_ASSET_RENDERER := preload("res://scripts/runtime_asset_renderer.gd")
const RUNTIME_PROXY_RENDERER := preload("res://scripts/runtime_proxy_renderer.gd")
const RUNTIME_LAUNCHER := preload("res://scripts/runtime_launcher.gd")

var _world: Node3D
var _launcher

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_launcher = RUNTIME_LAUNCHER.new()
	add_child(_launcher)
	_launcher.scene_selected.connect(_open_scene)
	_launcher.resume_requested.connect(_resume)
	var artifacts := RUNTIME_ARTIFACTS.new()
	var runtime_path := artifacts.runtime_path_from_args()
	if runtime_path.is_empty():
		_show_menu()
	else:
		_open_scene(runtime_path, artifacts.architecture_path_from_args(runtime_path))

func _open_scene(runtime_path: String, architecture_path: String = "") -> void:
	var artifacts := RUNTIME_ARTIFACTS.new()
	if architecture_path.is_empty():
		architecture_path = artifacts.default_architecture_path(runtime_path)
	var data := artifacts.load_runtime(runtime_path)
	if data.is_empty():
		_show_menu("Could not open this compiled runtime scene.\nExport a runtime scene from Plan2World and select its runtime JSON.\n%s" % runtime_path)
		return
	var spawn = _choose_spawn(data)
	if spawn == null:
		_show_menu("Runtime scene has no compiled player spawn. Re-export after setting a valid spawn in the authoring project.")
		return

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
	var build_result := loader.build(data, _world)
	var assets := artifacts.load_assets(runtime_path)
	var asset_renderer := RUNTIME_ASSET_RENDERER.new()
	var asset_result := asset_renderer.render(data, _world, build_result, assets)
	var proxy_renderer := RUNTIME_PROXY_RENDERER.new()
	var presentation_stats := proxy_renderer.render(data, _world, build_result, presentation_loaded, asset_result.get("presented", {}))
	var runtime_stats: Dictionary = build_result.get("stats", {})

	var player := P2WPlayer.new()
	player.name = "Player"
	_world.add_child(player)
	player.configure(data.get("playerProfile", {}), spawn)
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
		"WASD move · Ctrl slow · Shift fast · E door · Esc mouse · F1 scene menu\nProject: %s" % str(data["source"]["projectName"]) + ("\n" + "\n".join(notes) if not notes.is_empty() else ""),
	)
	_resume()
	print("Plan2World runtime loaded: ", runtime_path, " architecture=", presentation_status,
		" runtime=", runtime_stats, " assets=", asset_result.get("presented", {}).size(), " presentation=", presentation_stats)

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F1:
		if get_tree().paused and _world != null:
			_resume()
		else:
			_show_menu()
		get_viewport().set_input_as_handled()

func _show_menu(message: String = "") -> void:
	get_tree().paused = true
	_launcher.show_menu(_world != null, message)

func _resume() -> void:
	_launcher.hide_menu()
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

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
