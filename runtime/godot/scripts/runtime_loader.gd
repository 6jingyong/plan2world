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
			dynamic_colliders[str(collider.get("ownerId", ""))] = collider
			continue
		var node := _build_static_collider(collider, root)
		if node != null:
			collider_nodes[str(collider.get("id", ""))] = node
			static_count += 1

	var entity_nodes := {}
	var door_count := 0
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = raw_entity
		if str(entity.get("kind", "")) != "door":
			continue
		var collider: Dictionary = dynamic_colliders.get(str(entity.get("id", "")), {})
		var node := _build_door(entity, collider, root)
		if node != null and not collider.is_empty():
			collider_nodes[str(collider.get("id", ""))] = node
			entity_nodes[str(entity.get("id", ""))] = node
		door_count += 1

	return {
		"stats": {
			"entity_count": entities_by_id.size(),
			"static_collider_count": static_count,
			"door_count": door_count,
		},
		"collider_nodes": collider_nodes,
		"entity_nodes": entity_nodes,
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
	for raw_index in indices:
		var index := int(raw_index)
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

func _build_door(entity: Dictionary, collider: Dictionary, root: Node3D) -> Node3D:
	var interaction: Dictionary = entity.get("interaction", {})
	var motion := str(interaction.get("kind", "none"))
	if motion == "none" or collider.is_empty():
		return null
	match motion:
		"swing": return _build_swing_door(entity, collider, interaction, root)
		"slide": return _build_slide_door(entity, collider, interaction, root)
		_:
			# Unsupported source motion stays an explicit closed blocker. Never fake
			# fold/overhead semantics as a swing merely to make the adapter animate.
			return _build_static_box(collider, root)

func _build_swing_door(entity: Dictionary, collider: Dictionary, interaction: Dictionary, root: Node3D) -> Node3D:
	var hinge := _vec3(interaction.get("pivot", []))
	var axis := _vec3(interaction.get("axis", []))
	if axis.distance_to(Vector3.UP) > 0.001:
		return _build_static_box(collider, root)

	var closed_pose: Dictionary = entity.get("closedPose", {})
	var center := _vec3(closed_pose.get("center", []))
	var runtime_yaw := float(closed_pose.get("yawClockwiseRadians", 0.0))
	var godot_yaw := _yaw(runtime_yaw)
	var pivot := P2WDoor.new()
	pivot.name = "Door_%s" % str(entity.get("id", "door")).validate_node_name()
	pivot.position = hinge
	pivot.rotation.y = godot_yaw
	pivot.set_meta("p2w_id", str(entity.get("id", "")))
	pivot.set_meta("p2w_owner_id", str(entity.get("id", "")))
	root.add_child(pivot)

	var basis := Basis(Vector3.UP, godot_yaw)
	var local_center := basis.inverse() * (center - hinge)
	var size := _vec3(collider.get("size", []))
	var shape := BoxShape3D.new()
	shape.size = Vector3(max(size.x, 0.001), max(size.y, 0.001), max(size.z, 0.001))
	var collision_shape := CollisionShape3D.new()
	collision_shape.shape = shape
	collision_shape.position = local_center
	pivot.add_child(collision_shape)
	pivot.configure_swing(float(interaction.get("openAngleRadians", 0.0)))
	return pivot

func _build_slide_door(entity: Dictionary, collider: Dictionary, interaction: Dictionary, root: Node3D) -> Node3D:
	var axis := _vec3(interaction.get("axis", []))
	var travel := float(interaction.get("travel", 0.0))
	if axis.length_squared() <= 0.000001 or travel <= 0.0:
		return _build_static_box(collider, root)

	var closed_pose: Dictionary = entity.get("closedPose", {})
	var body := P2WDoor.new()
	body.name = "Door_%s" % str(entity.get("id", "door")).validate_node_name()
	body.position = _vec3(closed_pose.get("center", collider.get("center", [])))
	body.rotation.y = _yaw(closed_pose.get("yawClockwiseRadians", collider.get("yawClockwiseRadians", 0.0)))
	body.set_meta("p2w_id", str(entity.get("id", "")))
	body.set_meta("p2w_owner_id", str(entity.get("id", "")))
	root.add_child(body)

	var size := _vec3(collider.get("size", []))
	var shape := BoxShape3D.new()
	shape.size = Vector3(max(size.x, 0.001), max(size.y, 0.001), max(size.z, 0.001))
	var collision_shape := CollisionShape3D.new()
	collision_shape.shape = shape
	body.add_child(collision_shape)
	body.configure_slide(axis, travel)
	return body
