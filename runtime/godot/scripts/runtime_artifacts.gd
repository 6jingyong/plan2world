extends RefCounted
class_name P2WRuntimeArtifacts

const DEFAULT_RUNTIME_PATH := "res://demo/runtime-scene.json"
const RUNTIME_SUFFIX := ".runtime.json"
const JSON_SUFFIX := ".json"
const ARCHITECTURE_SUFFIX := ".architecture.glb"
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
	if data.get("schema", "") != "plan2world-runtime-v1" or int(data.get("version", 0)) != 1:
		push_error("Unsupported Plan2World runtime schema in %s" % path)
		return {}
	if not has_door_leaf_contract(data):
		push_error("Runtime door leaf contract is missing or unsupported; re-export the native Project: %s" % path)
		return {}
	return data

# The experimental v1 door contract now requires explicit parts. Do not guess
# a single leaf from older artifacts or silently drop their door collision.
func has_door_leaf_contract(data: Dictionary) -> bool:
	var colliders := {}
	for collider in data.get("colliders", []):
		colliders[str(collider.get("id", ""))] = collider
	var leaf_ids := {}
	for entity in data.get("entities", []):
		if entity.get("kind", "") != "door":
			continue
		var interaction: Dictionary = entity.get("interaction", {})
		var kind := str(interaction.get("kind", ""))
		if kind == "none":
			continue
		if kind not in ["swing", "slide", "unsupported"]:
			return false
		var leaves = interaction.get("leaves")
		if typeof(leaves) != TYPE_ARRAY or leaves.is_empty():
			return false
		for leaf in leaves:
			if typeof(leaf) != TYPE_DICTIONARY:
				return false
			for field in ["id", "colliderId", "assetRef", "size", "closedPose"]:
				if not leaf.has(field):
					return false
			var id := str(leaf["id"])
			if id.is_empty() or leaf_ids.has(id):
				return false
			leaf_ids[id] = true
			var collider: Dictionary = colliders.get(str(leaf["colliderId"]), {})
			if collider.get("ownerId") != entity["id"] or collider.get("kind") != "box" or not collider.get("dynamic", false):
				return false
			var axis = leaf.get("axis", [])
			if kind == "swing" and (typeof(axis) != TYPE_ARRAY or axis.size() != 3 or Vector3(axis[0], axis[1], axis[2]) != Vector3.UP or not leaf.has("pivot") or not leaf.has("openAngleRadians")):
				return false
			if kind == "slide" and (not leaf.has("axis") or not leaf.has("travel")):
				return false
	return true

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
		var asset: Dictionary = raw_asset
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
