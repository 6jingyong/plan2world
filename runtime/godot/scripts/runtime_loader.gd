extends Node
class_name P2WRuntimeLoader

var _wall_material: StandardMaterial3D
var _furniture_material: StandardMaterial3D
var _column_material: StandardMaterial3D
var _door_material: StandardMaterial3D
var _window_material: StandardMaterial3D
var _floor_material: StandardMaterial3D

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
	return data

func build(data: Dictionary, root: Node3D) -> Dictionary:
	_init_materials()
	var entities_by_id := {}
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) == TYPE_DICTIONARY:
			entities_by_id[str(raw_entity.get("id", ""))] = raw_entity

	_build_room_surfaces(data, root)

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
		_build_static_collider(collider, owner, root)
		static_count += 1

	var door_count := 0
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = raw_entity
		match str(entity.get("kind", "")):
			"door":
				_build_door(entity, dynamic_colliders.get(str(entity.get("id", "")), {}), root)
				door_count += 1
			"window":
				_build_window_marker(entity, root)

	return {
		"entity_count": entities_by_id.size(),
		"static_collider_count": static_count,
		"door_count": door_count,
	}

func _init_materials() -> void:
	if _wall_material != null:
		return
	_wall_material = _material(Color("d8d4cd"), 0.86)
	_furniture_material = _material(Color("9da9b8"), 0.72)
	_column_material = _material(Color("b7afa3"), 0.82)
	_door_material = _material(Color("8d6448"), 0.72)
	_floor_material = _material(Color("bab2a6"), 0.94)
	_window_material = _material(Color(0.36, 0.72, 0.92, 0.38), 0.18, true)

func _material(color: Color, roughness: float, transparent := false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	if transparent:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return material

func _vec3(value) -> Vector3:
	if typeof(value) != TYPE_ARRAY or value.size() < 3:
		return Vector3.ZERO
	return Vector3(float(value[0]), float(value[1]), float(value[2]))

func _yaw(value) -> float:
	# runtime-v1 yaw is clockwise in the +X/+Z plan. Godot's positive Y rotation
	# is the opposite sign in this coordinate convention.
	return -float(value)

func _build_static_collider(collider: Dictionary, owner: Dictionary, root: Node3D) -> void:
	match str(collider.get("kind", "")):
		"box": _build_static_box(collider, owner, root)
		"cylinder": _build_static_cylinder(collider, owner, root)

func _build_static_box(collider: Dictionary, owner: Dictionary, root: Node3D) -> void:
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

	if bool(owner.get("visible", true)):
		var mesh := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = shape.size
		mesh.mesh = box
		mesh.material_override = _material_for_owner(owner)
		body.add_child(mesh)

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

	var mesh := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = radius
	cylinder.bottom_radius = radius
	cylinder.height = height
	mesh.mesh = cylinder
	mesh.material_override = _material_for_owner(owner)
	body.add_child(mesh)

func _material_for_owner(owner: Dictionary) -> Material:
	match str(owner.get("kind", "")):
		"wall": return _wall_material
		"furniture": return _furniture_material
		"column": return _column_material
		_: return _wall_material

func _build_door(entity: Dictionary, collider: Dictionary, root: Node3D) -> void:
	if not bool(entity.get("interaction", {}).get("enabled", false)):
		return
	if collider.is_empty():
		return
	var interaction: Dictionary = entity.get("interaction", {})
	var motion := str(interaction.get("motion", "none"))
	if motion != "swing":
		# The first spike intentionally proves one interaction primitive. Other door
		# motions remain closed blockers until their adapter is added.
		_build_static_box(collider, {"kind": "door", "visible": true}, root)
		return

	var hinge := _vec3(interaction.get("hingePosition", []))
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

	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = shape.size
	mesh.mesh = box
	mesh.material_override = _door_material
	mesh.position = local_center
	pivot.add_child(mesh)

	var hinge_sign := 1.0 if str(entity.get("swingDirection", "left")) == "left" else -1.0
	var normal_sign := float(interaction.get("opensTowardWallNormal", 1))
	pivot.configure(hinge_sign * normal_sign * deg_to_rad(95.0))

func _build_window_marker(entity: Dictionary, root: Node3D) -> void:
	var mesh := MeshInstance3D.new()
	mesh.name = "Window_%s" % str(entity.get("id", "window")).validate_node_name()
	var box := BoxMesh.new()
	box.size = Vector3(max(float(entity.get("width", 0.01)), 0.01), max(float(entity.get("height", 0.01)), 0.01), 0.025)
	mesh.mesh = box
	mesh.material_override = _window_material
	mesh.position = _vec3(entity.get("center", []))
	mesh.rotation.y = _yaw(entity.get("yawClockwiseRadians", 0.0))
	root.add_child(mesh)

func _build_room_surfaces(data: Dictionary, root: Node3D) -> void:
	for raw_floor in data.get("floors", []):
		if typeof(raw_floor) != TYPE_DICTIONARY:
			continue
		var floor: Dictionary = raw_floor
		var elevation := float(floor.get("elevation", 0.0))
		for raw_room in floor.get("rooms", []):
			if typeof(raw_room) != TYPE_DICTIONARY:
				continue
			var room: Dictionary = raw_room
			var points := PackedVector2Array()
			for raw_point in room.get("polygon", []):
				if typeof(raw_point) == TYPE_ARRAY and raw_point.size() >= 2:
					points.append(Vector2(float(raw_point[0]), float(raw_point[1])))
			if points.size() < 3:
				continue
			var indices := Geometry2D.triangulate_polygon(points)
			if indices.is_empty():
				continue
			var surface := SurfaceTool.new()
			surface.begin(Mesh.PRIMITIVE_TRIANGLES)
			for index in indices:
				var point := points[index]
				surface.set_normal(Vector3.UP)
				surface.add_vertex(Vector3(point.x, elevation - 0.015, point.y))
			var room_mesh := MeshInstance3D.new()
			room_mesh.name = "Floor_%s" % str(room.get("id", "room")).validate_node_name()
			room_mesh.mesh = surface.commit()
			room_mesh.material_override = _floor_material
			root.add_child(room_mesh)
