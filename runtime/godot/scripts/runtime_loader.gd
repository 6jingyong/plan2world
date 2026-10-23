extends RefCounted
class_name P2WRuntimeLoader

const PROXY_RENDERER := preload("res://scripts/runtime_proxy_renderer.gd")

var _proxy_renderer := PROXY_RENDERER.new()

func build(data: Dictionary, root: Node3D, architecture_presentation_loaded := false) -> Dictionary:
	var entities_by_id := {}
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) == TYPE_DICTIONARY:
			entities_by_id[str(raw_entity.get("id", ""))] = raw_entity

	if not architecture_presentation_loaded:
		_proxy_renderer.add_room_surfaces(data, root)

	var dynamic_colliders := {}
	var static_count := 0
	for raw_collider in data.get("colliders", []):
		if typeof(raw_collider) != TYPE_DICTIONARY:
			continue
		var collider: Dictionary = raw_collider
		if bool(collider.get("dynamic", false)):
			dynamic_colliders[str(collider.get("ownerId", ""))] = collider
			continue
		var owner: Dictionary = entities_by_id.get(str(collider.get("ownerId", "")), {})
		_build_static_collider(collider, owner, root, architecture_presentation_loaded)
		static_count += 1

	var door_count := 0
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = raw_entity
		match str(entity.get("kind", "")):
			"door":
				_build_door(
					entity,
					dynamic_colliders.get(str(entity.get("id", "")), {}),
					root,
					architecture_presentation_loaded,
				)
				door_count += 1
			"window":
				_proxy_renderer.add_window_marker(entity, root)

	return {
		"entity_count": entities_by_id.size(),
		"static_collider_count": static_count,
		"door_count": door_count,
		"architecture_presentation_loaded": architecture_presentation_loaded,
	}

func _vec3(value) -> Vector3:
	if typeof(value) != TYPE_ARRAY or value.size() < 3:
		return Vector3.ZERO
	return Vector3(float(value[0]), float(value[1]), float(value[2]))

func _yaw(value) -> float:
	# runtime-v1 yaw is clockwise in the +X/+Z plan. Godot's positive Y rotation
	# is the opposite sign in this coordinate convention.
	return -float(value)

func _build_static_collider(
	collider: Dictionary,
	owner: Dictionary,
	root: Node3D,
	architecture_presentation_loaded: bool,
) -> void:
	match str(collider.get("kind", "")):
		"box": _build_static_box(collider, owner, root, architecture_presentation_loaded)
		"cylinder": _build_static_cylinder(collider, owner, root)

func _build_static_box(
	collider: Dictionary,
	owner: Dictionary,
	root: Node3D,
	architecture_presentation_loaded: bool,
) -> void:
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
	_proxy_renderer.add_box(body, shape.size, owner, architecture_presentation_loaded)

func _build_static_cylinder(collider: Dictionary, owner: Dictionary, root: Node3D) -> void:
	var body := StaticBody3D.new()
	body.name = "Collider_%s" % str(collider.get("id", "cylinder")).validate_node_name()
	body.position = _vec3(collider.get("center", []))
	body.set_meta("p2w_owner_id", str(collider.get("ownerId", "")))
	root.add_child(body)

	var radius := max(float(collider.get("radius", 0.01)), 0.001)
	var height := max(float(collider.get("height", 0.01)), 0.001)
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	var collision_shape := CollisionShape3D.new()
	collision_shape.shape = shape
	body.add_child(collision_shape)
	_proxy_renderer.add_cylinder(body, radius, height, owner)

func _build_door(
	entity: Dictionary,
	collider: Dictionary,
	root: Node3D,
	architecture_presentation_loaded: bool,
) -> void:
	var interaction: Dictionary = entity.get("interaction", {})
	var motion := str(interaction.get("kind", "none"))
	if motion == "none":
		return
	if collider.is_empty():
		return
	if motion != "swing":
		# Only explicit swing semantics are animated. Slide and unsupported motions
		# remain closed blockers until their adapter behavior is implemented.
		_build_static_box(
			collider,
			{"kind": "door", "visible": true},
			root,
			architecture_presentation_loaded,
		)
		return

	var hinge := _vec3(interaction.get("pivot", []))
	var axis := _vec3(interaction.get("axis", []))
	if axis.distance_to(Vector3.UP) > 0.001:
		_build_static_box(
			collider,
			{"kind": "door", "visible": true},
			root,
			architecture_presentation_loaded,
		)
		return
	var closed_pose: Dictionary = entity.get("closedPose", {})
	var center := _vec3(closed_pose.get("center", []))
	var runtime_yaw := float(closed_pose.get("yawClockwiseRadians", 0.0))
	var godot_yaw := _yaw(runtime_yaw)
	var pivot := P2WDoor.new()
	pivot.name = "Door_%s" % str(entity.get("id", "door")).validate_node_name()
	pivot.position = hinge
	pivot.rotation.y = godot_yaw
	pivot.set_meta("p2w_id", str(entity.get("id", "")))
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
	_proxy_renderer.add_door_leaf(pivot, shape.size, local_center)

	pivot.configure(float(interaction.get("openAngleRadians", 0.0)))
