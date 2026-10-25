extends RefCounted
class_name P2WRuntimeAssetRenderer

# Presentation instances only. No bounds measurement, meshing, collider creation,
# hinge inference or model-specific axis corrections belong in this adapter.
func render(data: Dictionary, root: Node3D, build_result: Dictionary, assets: Dictionary) -> Dictionary:
	var presented := {}
	var instances := {}
	var leaf_nodes: Dictionary = build_result["leaf_nodes"]
	for entity in data["entities"]:
		var kind := str(entity["kind"])
		var owner_id := str(entity["id"])
		if kind == "furniture":
			var pose := { "center": entity["position"], "yawClockwiseRadians": entity["yawClockwiseRadians"] }
			var instance := _instance(owner_id, owner_id, entity["assetRef"], pose, _vec3(entity["size"]), _vec3(entity.get("mirror", [1, 1, 1])), root, root, assets)
			if instance != null:
				instances[owner_id] = instance
				presented[owner_id] = true
		elif kind == "door":
			for leaf in entity["interaction"].get("leaves", []):
				var id := str(leaf["id"])
				var instance := _instance(id, owner_id, leaf["assetRef"], leaf["closedPose"], _vec3(leaf["size"]), Vector3.ONE, leaf_nodes[id], root, assets)
				if instance != null:
					instances[id] = instance
					presented[id] = true
	return { "presented": presented, "instances": instances }

func _instance(id: String, owner_id: String, ref: String, pose: Dictionary, size: Vector3, mirror: Vector3, parent: Node3D, runtime_root: Node3D, assets: Dictionary) -> Node3D:
	if not assets.has(ref):
		return null
	var asset: Dictionary = assets[ref]
	var model := (asset["scene"] as PackedScene).instantiate() as Node3D
	var instance := Node3D.new()
	instance.name = "Asset_%s" % id.validate_node_name()
	instance.set_meta("p2w_owner_id", owner_id)
	instance.set_meta("p2w_asset_ref", ref)
	var closed_transform := Transform3D(Basis(Vector3.UP, -float(pose["yawClockwiseRadians"])).scaled_local(size * mirror), _vec3(pose["center"]))
	parent.add_child(instance)
	# Leaf parents are loader-owned bodies at their explicit closed transforms.
	var parent_pose := Transform3D.IDENTITY
	var ancestor := parent
	while ancestor != runtime_root:
		parent_pose = ancestor.transform * parent_pose
		ancestor = ancestor.get_parent() as Node3D
	instance.transform = parent_pose.affine_inverse() * closed_transform
	var normalization: Dictionary = asset["normalization"]
	var fit := Node3D.new()
	fit.name = "Normalization"
	fit.position = _vec3(normalization["translation"])
	fit.scale = _vec3(normalization["scale"])
	instance.add_child(fit)
	fit.add_child(model)
	return instance

func _vec3(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))
