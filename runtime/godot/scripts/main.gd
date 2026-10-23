extends Node3D

const RUNTIME_ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const RUNTIME_LOADER := preload("res://scripts/runtime_loader.gd")
const RUNTIME_ASSET_RENDERER := preload("res://scripts/runtime_asset_renderer.gd")
const RUNTIME_PROXY_RENDERER := preload("res://scripts/runtime_proxy_renderer.gd")

func _ready() -> void:
	_build_environment()
	var artifacts := RUNTIME_ARTIFACTS.new()
	var runtime_path := artifacts.runtime_path_from_args()
	var architecture_path := artifacts.architecture_path_from_args(runtime_path)
	var data := artifacts.load_runtime(runtime_path)
	if data.is_empty():
		_show_status("Could not load runtime scene:\n%s" % runtime_path, true)
		return

	var architecture_scene = artifacts.load_architecture(architecture_path)
	var presentation_loaded := architecture_scene != null
	if presentation_loaded:
		add_child(architecture_scene)

	var loader := RUNTIME_LOADER.new()
	var build_result := loader.build(data, self)
	var assets := artifacts.load_assets(runtime_path)
	var asset_renderer := RUNTIME_ASSET_RENDERER.new()
	var asset_result := asset_renderer.render(data, self, build_result, assets)
	var proxy_renderer := RUNTIME_PROXY_RENDERER.new()
	var presentation_stats := proxy_renderer.render(data, self, build_result, presentation_loaded, asset_result.get("presented", {}))
	var runtime_stats: Dictionary = build_result.get("stats", {})

	var spawn := _choose_spawn(data)
	var player := P2WPlayer.new()
	player.name = "Player"
	add_child(player)
	player.configure(data.get("playerProfile", {}), spawn)
	var presentation_status := architecture_path if presentation_loaded else "runtime proxy fallback"
	_show_status(
		"WASD move  ·  Ctrl slow  ·  Shift fast  ·  E door  ·  Esc mouse\nRuntime: %s\nArchitecture: %s" % [runtime_path, presentation_status],
		false,
	)
	print(
		"Plan2World runtime loaded: ",
		runtime_path,
		" architecture=",
		presentation_status,
		" runtime=",
		runtime_stats,
		" assets=",
		asset_result.get("presented", {}).size(),
		" presentation=",
		presentation_stats,
	)

func _choose_spawn(data: Dictionary) -> Vector3:
	var floors: Array = data.get("floors", [])
	for raw_floor in floors:
		if typeof(raw_floor) != TYPE_DICTIONARY:
			continue
		var floor: Dictionary = raw_floor
		var explicit = floor.get("walkthroughStart", null)
		if typeof(explicit) == TYPE_ARRAY and explicit.size() >= 3:
			return Vector3(float(explicit[0]), float(explicit[1]), float(explicit[2]))
		var rooms: Array = floor.get("rooms", [])
		if rooms.is_empty() or typeof(rooms[0]) != TYPE_DICTIONARY:
			continue
		var polygon: Array = rooms[0].get("polygon", [])
		if polygon.is_empty():
			continue
		var centroid := Vector2.ZERO
		var count := 0
		for raw_point in polygon:
			if typeof(raw_point) == TYPE_ARRAY and raw_point.size() >= 2:
				centroid += Vector2(float(raw_point[0]), float(raw_point[1]))
				count += 1
		if count > 0:
			centroid /= float(count)
			return Vector3(centroid.x, float(floor.get("elevation", 0.0)), centroid.y)
	return Vector3(0, 0, 0)

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
	add_child(world)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_energy = 1.15
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 40.0
	add_child(sun)

func _show_status(text: String, error: bool) -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)
	var panel := ColorRect.new()
	panel.position = Vector2(16, 16)
	panel.size = Vector2(840, 86)
	panel.color = Color(0.05, 0.06, 0.08, 0.78 if not error else 0.9)
	layer.add_child(panel)
	var label := Label.new()
	label.position = Vector2(12, 9)
	label.size = panel.size - Vector2(24, 18)
	label.text = text
	label.modulate = Color("f8fafc") if not error else Color("fecaca")
	panel.add_child(label)
	if error:
		return
	var crosshair := Label.new()
	crosshair.text = "+"
	crosshair.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	crosshair.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-10, -12)
	crosshair.size = Vector2(20, 24)
	crosshair.modulate = Color(1, 1, 1, 0.9)
	layer.add_child(crosshair)
