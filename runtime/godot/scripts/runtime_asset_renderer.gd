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
	var closed_transform := Transform3D(Basis(Vector3.UP, -float(pose["yawClockwiseRadians"])).scaled_local(size * mirror), _vec3(pose["center"]))
	# Leaf parents are loader-owned bodies at their explicit closed transforms.
	var parent_pose := Transform3D.IDENTITY
	var ancestor := parent
	while ancestor != runtime_root:
		parent_pose = ancestor.transform * parent_pose
		ancestor = ancestor.get_parent() as Node3D
	var instance:=_model(id,owner_id,ref,asset,parent_pose.affine_inverse()*closed_transform)
	parent.add_child(instance)
	return instance

func _model(id:String,owner_id:String,ref:String,asset:Dictionary,pose:Transform3D) -> Node3D:
	var instance:=Node3D.new();instance.name="Asset_%s"%id.validate_node_name();instance.transform=pose
	instance.set_meta("p2w_owner_id",owner_id);instance.set_meta("p2w_asset_ref",ref)
	var normalization: Dictionary = asset["normalization"]
	var fit := Node3D.new()
	fit.name = "Normalization"
	fit.position = _vec3(normalization["translation"])
	fit.scale = _vec3(normalization["scale"])
	instance.add_child(fit)
	fit.add_child((asset["scene"] as PackedScene).instantiate())
	return instance

func replace_door_appearance(entity:Dictionary,collider_nodes:Dictionary,assets:Dictionary) -> bool:
	var targets:Array=[]
	for leaf in entity["interaction"].get("leaves",[]):
		if not assets.has(leaf["assetRef"]) or not collider_nodes.has(leaf["colliderId"]):return false
		var body:Node3D=collider_nodes[leaf["colliderId"]];var previous:Node3D
		for child in body.get_children():
			if child is Node3D and child.has_meta("p2w_asset_ref"):previous=child;break
		if previous==null:return false
		targets.append([leaf,body,previous])
	# Replace only presentation children. Existing body transforms, moving state,
	# colliders, player and other doors retain the exact same objects.
	for target in targets:
		var leaf:Dictionary=target[0];var body:Node3D=target[1];var previous:Node3D=target[2]
		var next:=_model(leaf["id"],entity["id"],leaf["assetRef"],assets[leaf["assetRef"]],previous.transform)
		body.remove_child(previous);body.add_child(next);previous.queue_free()
	return not targets.is_empty()

func _vec3(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))
