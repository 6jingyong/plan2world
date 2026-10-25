extends RefCounted
class_name P2WRuntimeArtifacts

const DEFAULT_RUNTIME_PATH := "res://demo/runtime-scene.json"
const RUNTIME_SUFFIX := ".runtime.json"
const JSON_SUFFIX := ".json"
const ARCHITECTURE_SUFFIX := ".architecture.glb"
const CONTRACT := preload("res://scripts/runtime_contract.gd")
static var _mesh_converter: GLTFDocumentExtensionConvertImporterMesh

func _init() -> void:
	if _mesh_converter == null:
		_mesh_converter = GLTFDocumentExtensionConvertImporterMesh.new()
		GLTFDocument.register_gltf_document_extension(_mesh_converter)

func runtime_path_from_args() -> String:
	var args := OS.get_cmdline_user_args()
	for i in range(args.size()):
		var arg := str(args[i])
		if arg.begins_with("--scene="):
			return arg.trim_prefix("--scene=")
		if arg == "--scene" and i + 1 < args.size():
			return str(args[i + 1])
		if arg == "--demo":
			return DEFAULT_RUNTIME_PATH
	return ""

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
	var suffix_path := runtime_path.to_lower()
	if suffix_path.ends_with(RUNTIME_SUFFIX):
		return runtime_path.left(runtime_path.length() - RUNTIME_SUFFIX.length()) + ARCHITECTURE_SUFFIX
	if suffix_path.ends_with(JSON_SUFFIX):
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
	if not CONTRACT.valid(data):
		push_error("Invalid Plan2World runtime contract; re-export the native Project: %s" % path)
		return {}
	return data

func architecture_matches(data: Dictionary, path: String) -> bool:
	var digest: String = data["source"].get("architectureSha256", "")
	return digest.is_empty() or not FileAccess.file_exists(path) or FileAccess.get_sha256(path) == digest

func load_architecture(path: String) -> Node:
	var scene := _load_glb(path)
	if scene != null:
		scene.name = "Architecture"
	return scene

func _load_glb(path: String) -> Node:
	if not FileAccess.file_exists(path):
		print("Plan2World presentation GLB not found; using runtime proxy visuals: ", path)
		return null
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var error := document.append_from_file(path, state)
	if error != OK:
		push_warning("Plan2World presentation GLB could not be loaded (%s): %s" % [error_string(error), path])
		return null
	var scene := document.generate_scene(state)
	if scene == null:
		push_warning("Plan2World presentation GLB generated no scene: %s" % path)
		return null
	return scene

func default_assets_path(runtime_path: String) -> String:
	var suffix_path := runtime_path.to_lower()
	if suffix_path.ends_with(RUNTIME_SUFFIX):
		return runtime_path.left(runtime_path.length() - RUNTIME_SUFFIX.length()) + ".assets"
	if suffix_path.ends_with(JSON_SUFFIX):
		return runtime_path.left(runtime_path.length() - JSON_SUFFIX.length()) + ".assets"
	return runtime_path + ".assets"

# Filesystem/import responsibility only. All fit transforms are emitted by the
# shared compiler. Models never provide collision or interaction semantics.
func load_assets(runtime_path: String) -> Dictionary:
	var directory := default_assets_path(runtime_path)
	var manifest_path := directory.path_join("manifest.json")
	if not FileAccess.file_exists(manifest_path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if typeof(parsed) != TYPE_DICTIONARY or parsed.get("schema", "") != "plan2world-runtime-assets-v1" or parsed.get("version", 0) != 1:
		push_warning("Unsupported runtime asset manifest: %s" % manifest_path)
		return {}
	var assets := {}
	var scenes := {}
	var filename_pattern := RegEx.create_from_string("^[a-f0-9]{64}\\.glb$")
	for raw_asset in parsed.get("assets", []):
		if not raw_asset is Dictionary:
			continue
		var asset: Dictionary = raw_asset
		var normalization = asset.get("normalization")
		if not normalization is Dictionary or not CONTRACT.vector(normalization.get("translation"), 3) or not CONTRACT.vector(normalization.get("scale"), 3) or normalization["scale"].any(func(value): return value <= 0):
			push_warning("Invalid asset normalization; using missing-asset fallback")
			continue
		var id := str(asset.get("id", ""))
		var uri := str(asset.get("uri", ""))
		var digest := str(asset.get("sha256", ""))
		if id.is_empty() or assets.has(id) or filename_pattern.search(uri) == null or uri != digest + ".glb":
			push_warning("Invalid runtime asset identity/path: %s" % id)
			continue
		var path := directory.path_join(uri)
		if not FileAccess.file_exists(path):
			push_warning("Missing runtime asset: %s" % id)
			continue
		if not scenes.has(uri):
			var file := FileAccess.open(path, FileAccess.READ)
			if file == null or file.get_length() != int(asset.get("byteLength", 0)) or FileAccess.get_sha256(path) != digest:
				push_warning("Runtime asset digest/length mismatch: %s" % id)
				continue
			var scene := _load_glb(path)
			if scene == null:
				continue
			var packed := PackedScene.new()
			var error := packed.pack(scene)
			scene.free()
			if error != OK:
				continue
			scenes[uri] = packed
		assets[id] = { "scene": scenes[uri], "normalization": asset.get("normalization", {}) }
	return assets
