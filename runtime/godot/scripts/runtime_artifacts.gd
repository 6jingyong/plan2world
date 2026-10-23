extends RefCounted
class_name P2WRuntimeArtifacts

const DEFAULT_RUNTIME_PATH := "res://demo/runtime-scene.json"
const RUNTIME_SUFFIX := ".runtime.json"
const JSON_SUFFIX := ".json"
const ARCHITECTURE_SUFFIX := ".architecture.glb"

func runtime_path_from_args() -> String:
	var args := OS.get_cmdline_user_args()
	for i in range(args.size()):
		var arg := str(args[i])
		if arg.begins_with("--scene="):
			return arg.trim_prefix("--scene=")
		if arg == "--scene" and i + 1 < args.size():
			return str(args[i + 1])
	return DEFAULT_RUNTIME_PATH

func architecture_path_from_args(runtime_path: String) -> String:
	var args := OS.get_cmdline_user_args()
	for i in range(args.size()):
		var arg := str(args[i])
		if arg.begins_with("--architecture="):
			return arg.trim_prefix("--architecture=")
		if arg == "--architecture" and i + 1 < args.size():
			return str(args[i + 1])
	return default_architecture_path(runtime_path)

func default_architecture_path(runtime_path: String) -> String:
	if runtime_path.ends_with(RUNTIME_SUFFIX):
		return runtime_path.left(runtime_path.length() - RUNTIME_SUFFIX.length()) + ARCHITECTURE_SUFFIX
	if runtime_path.ends_with(JSON_SUFFIX):
		return runtime_path.left(runtime_path.length() - JSON_SUFFIX.length()) + ARCHITECTURE_SUFFIX
	return runtime_path + ARCHITECTURE_SUFFIX

func load_runtime(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Plan2World runtime scene could not be opened: %s" % path)
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Plan2World runtime scene is not a JSON object: %s" % path)
		return {}
	var data: Dictionary = parsed
	if data.get("schema", "") != "plan2world-runtime-v1" or int(data.get("version", 0)) != 1:
		push_error("Unsupported Plan2World runtime schema in %s" % path)
		return {}
	return data

func load_architecture(path: String) -> Node:
	if not FileAccess.file_exists(path):
		print("Plan2World architecture GLB not found; using runtime proxy visuals: ", path)
		return null
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var error := document.append_from_file(path, state)
	if error != OK:
		push_warning("Plan2World architecture GLB could not be loaded (%s): %s" % [error_string(error), path])
		return null
	var scene := document.generate_scene(state)
	if scene == null:
		push_warning("Plan2World architecture GLB generated no scene: %s" % path)
		return null
	scene.name = "Architecture"
	return scene
