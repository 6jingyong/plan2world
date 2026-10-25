extends RefCounted
class_name P2WRuntimeLoader

func build(data: Dictionary, root: Node3D) -> Dictionary:
	var entities_by_id := {}
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) == TYPE_DICTIONARY:
			entities_by_id[str(raw_entity.get("id", ""))] = raw_entity

	var dynamic_colliders := {}
	var collider_nodes := {}
	var static_count := 0
	for raw_collider in data.get("colliders", []):
		if typeof(raw_collider) != TYPE_DICTIONARY:
			continue
		var collider: Dictionary = raw_collider
		if bool(collider.get("dynamic", false)):
			dynamic_colliders[str(collider.get("id", ""))] = collider
			continue
		var node := _build_static_collider(collider, root)
		if node != null:
			collider_nodes[str(collider.get("id", ""))] = node
			static_count += 1

	var entity_nodes := {}
	var leaf_nodes := {}
	var door_count := 0
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = raw_entity
		if str(entity.get("kind", "")) != "door":
			continue
		var node := _build_door(entity, dynamic_colliders, collider_nodes, leaf_nodes, root)
		if node != null:
			entity_nodes[str(entity["id"])] = node
		door_count += 1

	return {
		"stats": {
			"entity_count": entities_by_id.size(),
			"static_collider_count": static_count,
			"door_count": door_count,
		},
		"collider_nodes": collider_nodes,
		"entity_nodes": entity_nodes,
		"leaf_nodes": leaf_nodes,
	}

func _vec3(value) -> Vector3:
	if typeof(value) != TYPE_ARRAY or value.size() < 3:
		return Vector3.ZERO
	return Vector3(float(value[0]), float(value[1]), float(value[2]))

func _yaw(value) -> float:
	# runtime-v1 yaw is clockwise in the +X/+Z plan. Godot's positive Y rotation
	# is the opposite sign in this coordinate convention.
	return -float(value)

func _build_static_collider(collider: Dictionary, root: Node3D) -> Node3D:
	match str(collider.get("kind", "")):
		"box": return _build_static_box(collider, root)
		"cylinder": return _build_static_cylinder(collider, root)
		"triangle-mesh": return _build_static_triangle_mesh(collider, root)
		_: return null

func _build_static_box(collider: Dictionary, root: Node3D) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = "Collider_%s" % str(collider.get("id", "box")).validate_node_name()
	body.position = _vec3(collider.get("center", []))
	body.rotation.y = _yaw(collider.get("yawClockwiseRadians", 0.0))
	body.set_meta("p2w_owner_id", str(collider.get("ownerId", "")))
	root.add_child(body)

	var size := _vec3(collider.get("size", []))
	var shape := BoxShape3D.new()
	shape.size = Vector3(max(size.x, 0.001), max(size.y, 0.001), max(size.z, 0.001))
	var collision_shape := CollisionShape3D.new()
	collision_shape.shape = shape
	body.add_child(collision_shape)
	return body

func _build_static_cylinder(collider: Dictionary, root: Node3D) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = "Collider_%s" % str(collider.get("id", "cylinder")).validate_node_name()
	body.position = _vec3(collider.get("center", []))
	body.set_meta("p2w_owner_id", str(collider.get("ownerId", "")))
	root.add_child(body)

	var radius := maxf(float(collider.get("radius", 0.01)), 0.001)
	var height := maxf(float(collider.get("height", 0.01)), 0.001)
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	var collision_shape := CollisionShape3D.new()
	collision_shape.shape = shape
	body.add_child(collision_shape)
	return body

func _build_static_triangle_mesh(collider: Dictionary, root: Node3D) -> StaticBody3D:
	var vertices: Array = collider.get("vertices", [])
	var indices: Array = collider.get("indices", [])
	if vertices.size() < 3 or indices.size() < 3 or indices.size() % 3 != 0:
		push_warning("Ignoring invalid triangle-mesh collider: %s" % str(collider.get("id", "triangle-mesh")))
		return null

	var faces := PackedVector3Array()
	# Runtime triangles use right-handed CCW normals. Godot's front faces use
	# clockwise winding; convert once at the engine boundary, including physics.
	for triangle in range(0, indices.size(), 3):
		for offset in [0, 2, 1]:
			var index := int(indices[triangle + offset])
			if index < 0 or index >= vertices.size():
				push_warning("Ignoring triangle-mesh collider with out-of-range index: %s" % str(collider.get("id", "triangle-mesh")))
				return null
			faces.append(_vec3(vertices[index]))

	var body := StaticBody3D.new()
	body.name = "Collider_%s" % str(collider.get("id", "triangle-mesh")).validate_node_name()
	body.set_meta("p2w_owner_id", str(collider.get("ownerId", "")))
	root.add_child(body)

	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(faces)
	var collision_shape := CollisionShape3D.new()
	collision_shape.shape = shape
	body.add_child(collision_shape)
	return body

func _build_door(entity: Dictionary, colliders: Dictionary, collider_nodes: Dictionary, leaf_nodes: Dictionary, root: Node3D) -> Node3D:
	var interaction: Dictionary = entity["interaction"]
	var motion := str(interaction["kind"])
	if motion == "none":
		return null
	var supported := motion == "swing" or motion == "slide"
	var assembly: Node3D = P2WDoor.new() if supported else Node3D.new()
	assembly.name = "Door_%s" % str(entity["id"]).validate_node_name()
	assembly.set_meta("p2w_owner_id", str(entity["id"]))
	root.add_child(assembly)
	if supported:
		# A leaf is joined to its explicit host. Ignore that connected wall in
		# obstruction queries (including pocket/slide travel inside the host).
		for node in collider_nodes.values():
			if node.get_meta("p2w_owner_id", "") == entity["hostWallId"]:
				assembly.host_exclusions.append(node.get_rid())
	for leaf in interaction["leaves"]:
		var collider: Dictionary = colliders[str(leaf["colliderId"])]
		var body: PhysicsBody3D = AnimatableBody3D.new() if supported else StaticBody3D.new()
		body.name = str(leaf["id"]).validate_node_name()
		body.set_meta("p2w_owner_id", str(entity["id"]))
		body.set_meta("p2w_leaf_id", str(leaf["id"]))
		body.position = _vec3(leaf["pivot"]) if motion == "swing" else _vec3(collider["center"])
		body.rotation.y = _yaw(collider["yawClockwiseRadians"])
		assembly.add_child(body)
		var shape := BoxShape3D.new()
		shape.size = _vec3(collider["size"])
		var collision_shape := CollisionShape3D.new()
		collision_shape.shape = shape
		body.add_child(collision_shape)
		var closed_collider := Transform3D(Basis(Vector3.UP, _yaw(collider["yawClockwiseRadians"])), _vec3(collider["center"]))
		collision_shape.transform = body.transform.affine_inverse() * closed_collider
		if supported:
			body.sync_to_physics = true
			body.set_meta("p2w_interaction_target", assembly)
			if motion == "swing":
				assembly.configure_swing(body, float(leaf["openAngleRadians"]))
			else:
				assembly.configure_slide(body, _vec3(leaf["axis"]), float(leaf["travel"]))
		# Unsupported source motion stays an explicit closed blocker. No engine
		# inference or silent fold/overhead -> swing substitution.
		collider_nodes[str(collider["id"])] = body
		leaf_nodes[str(leaf["id"])] = body
	return assembly
