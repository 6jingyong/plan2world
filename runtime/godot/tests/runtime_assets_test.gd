extends SceneTree

const ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const LOADER := preload("res://scripts/runtime_loader.gd")
const RENDERER := preload("res://scripts/runtime_asset_renderer.gd")
const PROXIES := preload("res://scripts/runtime_proxy_renderer.gd")
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _bounds(node: Node3D, frame: Transform3D) -> AABB:
	var result := AABB()
	var first := true
	var pending: Array[Node] = [node]
	while not pending.is_empty():
		var child := pending.pop_back() as Node
		pending.append_array(child.get_children())
		_check(not (child is CollisionObject3D) and not (child is CollisionShape3D), "Imported presentation must contain no physics nodes")
		if child is MeshInstance3D:
			var mesh := child as MeshInstance3D
			var relative := frame.affine_inverse() * mesh.global_transform
			for surface in range(mesh.mesh.get_surface_count()):
				var vertices: PackedVector3Array = mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
				for vertex in vertices:
					var point: Vector3 = relative * vertex
					if first:
						result = AABB(point, Vector3.ZERO)
						first = false
					else:
						result = result.expand(point)
	_check(not first, "Asset must contain imported mesh vertices")
	return result

func _run() -> void:
	var artifacts := ARTIFACTS.new()
	_check(artifacts.default_assets_path("House.RUNTIME.JSON") == "House.assets", "Asset path suffix must match CLI case handling")
	_check(artifacts.default_architecture_path("House.RUNTIME.JSON") == "House.architecture.glb", "Architecture path suffix must match CLI case handling")
	_check(artifacts.default_assets_path("House.JSON") == "House.assets", "Generic JSON asset path")
	_check(artifacts.default_assets_path("House") == "House.assets", "Extensionless asset path")
	var runtime_path := artifacts.runtime_path_from_args()
	var data := artifacts.load_runtime(runtime_path)
	if data.is_empty():
		quit(1)
		return
	var legacy := data.duplicate(true)
	legacy["entities"].filter(func(e): return e["kind"] == "door")[0]["interaction"].erase("leaves")
	_check(not artifacts.has_door_leaf_contract(legacy), "Older single-leaf artifacts must require re-export, never inferred motion")
	var wrong_owner := data.duplicate(true)
	wrong_owner["colliders"].filter(func(c): return c["dynamic"])[0]["ownerId"] = "unrelated"
	_check(not artifacts.has_door_leaf_contract(wrong_owner), "Leaf collider ownership must be explicit and valid")
	var assets := artifacts.load_assets(runtime_path)
	_check(assets.size() == 5, "Expected catalog, custom aliases and shared door leaf assets")
	var world := Node3D.new()
	root.add_child(world)
	world.position = Vector3(4, 2, -3)
	world.rotation.y = 0.3
	var architecture := artifacts.load_architecture(artifacts.default_architecture_path(runtime_path))
	_check(architecture != null, "Export must include architecture GLB")
	if architecture != null:
		world.add_child(architecture)
		var meshes := architecture.find_children("*", "MeshInstance3D", true, false)
		_check(not meshes.is_empty(), "Architecture GLB must instantiate actual renderable meshes, not import-only nodes")
		for mesh in meshes:
			_check(not mesh.get_meta("extras", {}).get("plan2world", {}).is_empty(), "Renderable architecture must retain compiler ownership metadata")
	var built := LOADER.new().build(data, world)
	var result := RENDERER.new().render(data, world, built, assets)
	var instances: Dictionary = result["instances"]
	_check(instances.size() == 14, "Expected ten door leaves and four furniture instances")
	var stats := PROXIES.new().render(data, world, built, true, result["presented"])
	_check(stats["collider_proxy_count"] == 1, "Only genuine missing furniture may use a collider proxy")
	_check(world.get_node_or_null("MissingAsset_missing-flat") != null, "Missing flat furniture needs a semantic fallback without collision")
	_check(not built["collider_nodes"].has("furniture:flat"), "Flat custom furniture must not acquire asset-derived collision")
	await process_frame

	for entity in data["entities"]:
		if entity["kind"] == "furniture" and instances.has(entity["id"]):
			var frame := Transform3D(Basis(Vector3.UP, -float(entity["yawClockwiseRadians"])), _vec3(entity["position"]))
			var bounds := _bounds(instances[entity["id"]], world.global_transform * frame)
			_check(bounds.size.distance_to(_vec3(entity["size"])) < 0.0001, "Furniture effective size mismatch")
			_check(bounds.get_center().length() < 0.0001, "Furniture center/elevation mismatch")
		elif entity["kind"] == "door":
			for leaf in entity["interaction"].get("leaves", []):
				var id := str(leaf["id"])
				var frame := Transform3D(Basis(Vector3.UP, -float(leaf["closedPose"]["yawClockwiseRadians"])), _vec3(leaf["closedPose"]["center"]))
				var bounds := _bounds(instances[id], world.global_transform * frame)
				var size := _vec3(leaf["size"])
				_check(bounds.size.distance_to(size) < 0.0001, "Leaf effective size mismatch: " + id)
				_check(bounds.get_center().length() < 0.0001, "Leaf center/elevation mismatch: " + id)
				var body: Node3D = built["leaf_nodes"][id]
				_check(instances[id].get_parent() == body, "Door presentation must follow its own physics leaf")
				_check(built["collider_nodes"][leaf["colliderId"]] == body, "Each leaf must have its own compiler-owned collider")
				var shape: CollisionShape3D = body.get_child(0)
				_check((shape.shape as BoxShape3D).size.distance_to(size) < 0.0001, "Leaf/collider alignment mismatch")

	var custom: Node3D = instances["custom"]
	_check(custom.transform.basis.x.dot(Basis(Vector3.UP, -PI/3).x) < 0, "Native X mirror must survive export/import")
	_check(custom.transform.basis.z.dot(Basis(Vector3.UP, -PI/3).z) < 0, "Native plan Y mirror must map to world Z")
	var original_transforms := {}
	for entity in data["entities"]:
		if entity["kind"] != "door" or entity["interaction"]["kind"] == "none":
			continue
		var supported: bool = entity["interaction"]["kind"] != "unsupported"
		var assembly: Node3D = built["entity_nodes"][entity["id"]]
		_check((assembly is P2WDoor) == supported, "Only supported mechanisms have an interaction controller")
		for leaf in entity["interaction"]["leaves"]:
			var body: Node3D = built["leaf_nodes"][leaf["id"]]
			original_transforms[leaf["id"]] = body.transform
			_check(body is AnimatableBody3D if supported else body is StaticBody3D, "Correct physical leaf type")
			_check(body.get_meta("p2w_interaction_target", null) == assembly if supported else not body.has_meta("p2w_interaction_target"), "Both leaves must route interaction to the same native door")
		if supported:
			assembly.interact()
			assembly.interact() # repeated input during animation must not desynchronize leaves
	_check(not built["entity_nodes"].has("door-6"), "Leafless opening must have no body or asset")
	await create_timer(0.7).timeout
	for entity in data["entities"]:
		if entity["kind"] != "door":
			continue
		var motion: Dictionary = entity["interaction"]
		for leaf in motion.get("leaves", []):
			var id := str(leaf["id"])
			var body: Node3D = built["leaf_nodes"][id]
			var original: Transform3D = original_transforms[id]
			_check(body.transform.is_equal_approx(original) if motion["kind"] == "unsupported" else not body.transform.is_equal_approx(original), "Incorrect door motion: " + id)
			if motion["kind"] == "slide":
				_check(body.position.distance_to(original.origin + _vec3(leaf["axis"]) * float(leaf["travel"])) < 0.0001, "Slide axis/travel must come from runtime")
			elif motion["kind"] == "swing":
				_check(body.basis.is_equal_approx(Basis(Vector3.UP, float(leaf["openAngleRadians"])) * original.basis), "Swing angle must come from runtime")
			var expected: Transform3D = body.transform * original.affine_inverse() * Transform3D(Basis(Vector3.UP, -float(leaf["closedPose"]["yawClockwiseRadians"])), _vec3(leaf["closedPose"]["center"]))
			_check(_bounds(instances[id], world.global_transform * expected).get_center().length() < 0.0001, "Door asset detached from motion: " + id)
		if motion["kind"] == "swing" or motion["kind"] == "slide":
			built["entity_nodes"][entity["id"]].interact()
	await create_timer(0.7).timeout
	for id in original_transforms:
		_check(built["leaf_nodes"][id].transform.is_equal_approx(original_transforms[id]), "Closing must restore every leaf exactly")

	# Missing one packaged source must affect presentation only, without duplicate
	# furniture or altered physics. Exercise the actual missing-file loader path.
	var missing_path := "user://asset-test.runtime.json"
	var missing_dir := artifacts.default_assets_path(missing_path)
	DirAccess.make_dir_recursive_absolute(missing_dir)
	var manifest := FileAccess.open(missing_dir.path_join("manifest.json"), FileAccess.WRITE)
	manifest.store_string(JSON.stringify({ "schema": "plan2world-runtime-assets-v1", "version": 1, "assets": [{
		"id": "missing", "uri": "0".repeat(64) + ".glb", "sha256": "0".repeat(64), "byteLength": 20,
		"normalization": { "translation": [0,0,0], "scale": [1,1,1] }
	}] }))
	manifest.close()
	_check(artifacts.load_assets(missing_path).is_empty(), "Missing source must not resolve")
	DirAccess.remove_absolute(missing_dir.path_join("manifest.json"))
	DirAccess.remove_absolute(missing_dir)
	assets.erase("catalog:chair")
	var fallback_world := Node3D.new()
	root.add_child(fallback_world)
	var fallback_built := LOADER.new().build(data, fallback_world)
	var fallback_result := RENDERER.new().render(data, fallback_world, fallback_built, assets)
	var fallback_stats := PROXIES.new().render(data, fallback_world, fallback_built, true, fallback_result["presented"])
	_check(fallback_stats["collider_proxy_count"] == 2, "Missing model must have exactly one proxy")
	_check(fallback_built["collider_nodes"].size() == built["collider_nodes"].size(), "Presentation must never change physics")
	# Missing shared door presentation produces one fallback per physical part,
	# with no additional full-width blocker or duplicate paired-door mesh.
	assets.erase("builtin:door-leaf-v1")
	var missing_doors := Node3D.new()
	root.add_child(missing_doors)
	var missing_built := LOADER.new().build(data, missing_doors)
	var missing_result := RENDERER.new().render(data, missing_doors, missing_built, assets)
	var missing_stats := PROXIES.new().render(data, missing_doors, missing_built, true, missing_result["presented"])
	_check(missing_stats["collider_proxy_count"] == 12, "Ten missing leaves plus two missing furniture colliders need exactly twelve proxies")
	_check(missing_built["collider_nodes"].size() == built["collider_nodes"].size(), "Missing leaf assets must preserve physics")
	# Changing a collider must not resize its independent presentation instance.
	var independent_data := data.duplicate(true)
	var leaf: Dictionary = independent_data["entities"].filter(func(e): return e["kind"] == "door")[0]["interaction"]["leaves"][0]
	for collider in independent_data["colliders"]:
		if collider["id"] == leaf["colliderId"]:
			collider["size"] = [0.2, 0.3, 0.1]
	var independent_world := Node3D.new()
	root.add_child(independent_world)
	var independent_built := LOADER.new().build(independent_data, independent_world)
	var independent_result := RENDERER.new().render(independent_data, independent_world, independent_built, artifacts.load_assets(runtime_path))
	var leaf_frame := Transform3D(Basis(Vector3.UP, -float(leaf["closedPose"]["yawClockwiseRadians"])), _vec3(leaf["closedPose"]["center"]))
	_check(_bounds(independent_result["instances"][leaf["id"]], leaf_frame).size.distance_to(_vec3(leaf["size"])) < 0.0001, "Presentation must never derive fit from collision")
	world.free()
	fallback_world.free()
	missing_doors.free()
	independent_world.free()
	print("Runtime asset integration: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)

func _vec3(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))
