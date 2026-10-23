extends RefCounted
class_name P2WRuntimeProxyRenderer

var _wall_material: StandardMaterial3D
var _furniture_material: StandardMaterial3D
var _column_material: StandardMaterial3D
var _door_material: StandardMaterial3D
var _window_material: StandardMaterial3D
var _floor_material: StandardMaterial3D

func _init() -> void:
	_wall_material = _material(Color("d8d4cd"), 0.86)
	_furniture_material = _material(Color("9da9b8"), 0.72)
	_column_material = _material(Color("b7afa3"), 0.82)
	_door_material = _material(Color("8d6448"), 0.72)
	_floor_material = _material(Color("bab2a6"), 0.94)
	_window_material = _material(Color(0.36, 0.72, 0.92, 0.38), 0.18, true)

func render(
	data: Dictionary,
	root: Node3D,
	build_result: Dictionary,
	architecture_presentation_loaded: bool,
) -> Dictionary:
	var entities_by_id := {}
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) == TYPE_DICTIONARY:
			entities_by_id[str(raw_entity.get("id", ""))] = raw_entity

	var floor_surface_count := 0
	if not architecture_presentation_loaded:
		floor_surface_count = _add_room_surfaces(data, root)

	var collider_nodes: Dictionary = build_result.get("collider_nodes", {})
	var collider_proxy_count := 0
	for raw_collider in data.get("colliders", []):
		if typeof(raw_collider) != TYPE_DICTIONARY:
			continue
		var collider: Dictionary = raw_collider
		var node = collider_nodes.get(str(collider.get("id", "")), null)
		if node == null or not (node is Node3D):
			continue
		var owner: Dictionary = entities_by_id.get(str(collider.get("ownerId", "")), {})
		if not bool(owner.get("visible", true)):
			continue
		if architecture_presentation_loaded and str(owner.get("kind", "")) == "wall":
			continue
		if _add_collider_proxy(node as Node3D, owner):
			collider_proxy_count += 1

	var window_marker_count := 0
	for raw_entity in data.get("entities", []):
		if typeof(raw_entity) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = raw_entity
		if str(entity.get("kind", "")) != "window" or not bool(entity.get("visible", true)):
			continue
		_add_window_marker(entity, root)
		window_marker_count += 1

	return {
		"architecture_presentation_loaded": architecture_presentation_loaded,
		"floor_surface_count": floor_surface_count,
		"collider_proxy_count": collider_proxy_count,
		"window_marker_count": window_marker_count,
	}

func _add_collider_proxy(body: Node3D, owner: Dictionary) -> bool:
	var collision_shape := _direct_collision_shape(body)
	if collision_shape == null or collision_shape.shape == null:
		return false
	var mesh := MeshInstance3D.new()
	var shape_resource := collision_shape.shape
	if shape_resource is BoxShape3D:
		var box := BoxMesh.new()
		box.size = (shape_resource as BoxShape3D).size
		mesh.mesh = box
	elif shape_resource is CylinderShape3D:
		var cylinder_shape := shape_resource as CylinderShape3D
		var cylinder := CylinderMesh.new()
		cylinder.top_radius = cylinder_shape.radius
		cylinder.bottom_radius = cylinder_shape.radius
		cylinder.height = cylinder_shape.height
		mesh.mesh = cylinder
	else:
		return false
	mesh.transform = collision_shape.transform
	mesh.material_override = _material_for_owner(owner)
	body.add_child(mesh)
	return true

func _direct_collision_shape(body: Node3D) -> CollisionShape3D:
	for child in body.get_children():
		if child is CollisionShape3D:
			return child as CollisionShape3D
	return null

func _add_window_marker(entity: Dictionary, root: Node3D) -> void:
	var mesh := MeshInstance3D.new()
	mesh.name = "Window_%s" % str(entity.get("id", "window")).validate_node_name()
	var box := BoxMesh.new()
	box.size = Vector3(
		max(float(entity.get("width", 0.01)), 0.01),
		max(float(entity.get("height", 0.01)), 0.01),
		0.025
	)
	mesh.mesh = box
	mesh.material_override = _window_material
	mesh.position = _vec3(entity.get("center", []))
	mesh.rotation.y = _yaw(entity.get("yawClockwiseRadians", 0.0))
	root.add_child(mesh)

func _add_room_surfaces(data: Dictionary, root: Node3D) -> int:
	var count := 0
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
			count += 1
	return count

func _material_for_owner(owner: Dictionary) -> Material:
	match str(owner.get("kind", "")):
		"wall": return _wall_material
		"furniture": return _furniture_material
		"column": return _column_material
		"door": return _door_material
		_: return _wall_material

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
	return -float(value)
