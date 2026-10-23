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
	var assets := artifacts.load_assets(runtime_path)
	_check(assets.size() == 5, "Expected catalog, custom aliases and shared door leaf assets")
	var world := Node3D.new()
	root.add_child(world)
	var architecture := artifacts.load_architecture(artifacts.default_architecture_path(runtime_path))
	_check(architecture != null, "Export must include architecture GLB")
	if architecture != null:
		world.add_child(architecture)
	var built := LOADER.new().build(data, world)
	var result := RENDERER.new().render(data, world, built, assets)
	var instances: Dictionary = result["instances"]
	_check(instances.size() == 10, "Expected six door leaves and four furniture instances")
	var stats := PROXIES.new().render(data, world, built, true, result["presented"])
	_check(stats["collider_proxy_count"] == 1, "Only genuine missing furniture may use a collider proxy")
	_check(world.get_node_or_null("MissingAsset_missing-flat") != null, "Missing flat furniture needs a semantic fallback without collision")
	_check(not built["collider_nodes"].has("furniture:flat"), "Flat custom furniture must not acquire asset-derived collision")
	await process_frame

	for entity in data["entities"]:
		var id := str(entity["id"])
		if not instances.has(id):
			continue
		var center: Vector3
		var size: Vector3
		var yaw: float
		if entity["kind"] == "furniture":
			center = _vec3(entity["position"])
			size = _vec3(entity["size"])
			yaw = -float(entity["yawClockwiseRadians"])
		else:
			center = _vec3(entity["closedPose"]["center"])
			size = Vector3(entity["width"], entity["height"], entity["leafThickness"])
			yaw = -float(entity["closedPose"]["yawClockwiseRadians"])
		var bounds := _bounds(instances[id], Transform3D(Basis(Vector3.UP, yaw), center))
		_check(bounds.size.distance_to(size) < 0.0001, "Asset effective size mismatch: " + id)
		_check(bounds.get_center().length() < 0.0001, "Asset center/elevation mismatch: " + id)
		if entity["kind"] == "door":
			var body: Node3D = built["entity_nodes"][id]
			_check(instances[id].get_parent() == body, "Door presentation must follow the loader's physics node")
			var shape: CollisionShape3D = body.get_child(0)
			_check((shape.shape as BoxShape3D).size.distance_to(size) < 0.0001, "Leaf/collider alignment mismatch")

	var custom: Node3D = instances["custom"]
	_check(custom.transform.basis.x.dot(Basis(Vector3.UP, -PI/3).x) < 0, "Native X mirror must survive export/import")
	_check(custom.transform.basis.z.dot(Basis(Vector3.UP, -PI/3).z) < 0, "Native plan Y mirror must map to world Z")
	var original_transforms := {}
	for i in range(6):
		var id := "door-%d" % i
		var body: Node3D = built["entity_nodes"][id]
		original_transforms[id] = body.transform
		if i < 4:
			_check(body is P2WDoor, "Swing/slide must use interactive physics bodies")
			(body as P2WDoor).interact()
		else:
			_check(body is StaticBody3D, "Fold/overhead remain explicit static blockers")
	_check(not built["entity_nodes"].has("door-6"), "Leafless opening must have no body or asset")
	await create_timer(0.7).timeout
	for i in range(6):
		var id := "door-%d" % i
		var body: Node3D = built["entity_nodes"][id]
		var original: Transform3D = original_transforms[id]
		_check(not body.transform.is_equal_approx(original) if i < 4 else body.transform.is_equal_approx(original), "Incorrect door motion: " + id)
		if i < 4:
			var entity: Dictionary = data["entities"].filter(func(e): return e["id"] == id)[0]
			var motion: Dictionary = entity["interaction"]
			if motion["kind"] == "slide":
				_check(body.position.distance_to(original.origin + _vec3(motion["axis"]) * float(motion["travel"])) < 0.0001, "Slide axis/travel must come from runtime")
			else:
				_check(absf(body.rotation.y - (original.basis.get_euler().y + float(motion["openAngleRadians"]))) < 0.0001, "Swing angle must come from runtime")
			var expected: Transform3D = body.transform * original.affine_inverse() * Transform3D(Basis(Vector3.UP, -float(entity["closedPose"]["yawClockwiseRadians"])), _vec3(entity["closedPose"]["center"]))
			_check(_bounds(instances[id], expected).get_center().length() < 0.0001, "Door asset detached from motion: " + id)

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
	world.free()
	fallback_world.free()
	print("Runtime asset integration: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)

func _vec3(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))
