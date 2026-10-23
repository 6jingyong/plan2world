extends RefCounted
class_name P2WRuntimeAssetRenderer

# Presentation instances only. No bounds measurement, meshing, collider creation,
# hinge inference or model-specific axis corrections belong in this adapter.
func render(data: Dictionary, root: Node3D, build_result: Dictionary, assets: Dictionary) -> Dictionary:
	var presented := {}
	var instances := {}
	var entity_nodes: Dictionary = build_result.get("entity_nodes", {})
	for raw_entity in data.get("entities", []):
		var entity: Dictionary = raw_entity
		var kind := str(entity.get("kind", ""))
		if kind != "furniture" and kind != "door":
			continue
		var ref := str(entity.get("assetRef", ""))
		if not assets.has(ref):
			continue
		var id := str(entity.get("id", ""))
		var asset: Dictionary = assets[ref]
		var normalization: Dictionary = asset.get("normalization", {})
		var model: Node3D = (asset["scene"] as PackedScene).instantiate() as Node3D
		var instance := Node3D.new()
		instance.name = "Asset_%s" % id.validate_node_name()
		instance.set_meta("p2w_owner_id", id)
		instance.set_meta("p2w_asset_ref", ref)
		var center: Vector3
		var size: Vector3
		var yaw: float
		var parent: Node3D = root
		var mirror := Vector3.ONE
		if kind == "furniture":
			center = _vec3(entity["position"])
			size = _vec3(entity["size"])
			yaw = -float(entity["yawClockwiseRadians"])
			mirror = _vec3(entity.get("mirror", [1, 1, 1]))
		else:
			parent = entity_nodes.get(id, null) as Node3D
			if parent == null:
				model.free()
				instance.free()
				continue
			var pose: Dictionary = entity["closedPose"]
			center = _vec3(pose["center"])
			size = Vector3(float(entity["width"]), float(entity["height"]), float(entity["leafThickness"]))
			yaw = -float(pose["yawClockwiseRadians"])
		var closed_transform := Transform3D(Basis(Vector3.UP, yaw).scaled_local(size * mirror), center)
		parent.add_child(instance)
		# Loader-owned door pivots/bodies and closedPose are already explicit.
		instance.transform = closed_transform if parent == root else parent.transform.affine_inverse() * closed_transform
		var fit := Node3D.new()
		fit.name = "Normalization"
		fit.position = _vec3(normalization["translation"])
		fit.scale = _vec3(normalization["scale"])
		instance.add_child(fit)
		fit.add_child(model)
		presented[id] = true
		instances[id] = instance
	return { "presented": presented, "instances": instances }

func _vec3(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))
