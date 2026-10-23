extends RefCounted
class_name P2WRuntimeProxyRenderer

var _wall_material: StandardMaterial3D
var _furniture_material: StandardMaterial3D
var _column_material: StandardMaterial3D
var _door_material: StandardMaterial3D
var _window_material: StandardMaterial3D
var _floor_material: StandardMaterial3D
var _stair_material: StandardMaterial3D

func _init() -> void:
	_wall_material = _material(Color("d8d4cd"), 0.86)
	_furniture_material = _material(Color("9da9b8"), 0.72)
	_column_material = _material(Color("b7afa3"), 0.82)
	_door_material = _material(Color("8d6448"), 0.72)
	_floor_material = _material(Color("bab2a6"), 0.94)
	_stair_material = _material(Color("c49a6c"), 0.82)
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

	var collider_nodes: Dictionary = build_result.get("collider_nodes", {})
	var collider_proxy_count := 0
	var floor_surface_count := 0
	var static_proxy_suppressed_count := 0
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
		var owner_kind := str(owner.get("kind", ""))
		var is_floor_surface := _is_floor_surface(collider)
		if architecture_presentation_loaded and _glb_owns(owner_kind, is_floor_surface):
			static_proxy_suppressed_count += 1
			continue
		if _add_collider_proxy(node as Node3D, owner, collider):
			collider_proxy_count += 1
			if is_floor_surface:
				floor_surface_count += 1

	var window_marker_count := 0
	if not architecture_presentation_loaded:
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
		"static_proxy_suppressed_count": static_proxy_suppressed_count,
		"window_marker_count": window_marker_count,
	}

func _glb_owns(owner_kind: String, is_floor_surface: bool) -> bool:
	return is_floor_surface or owner_kind == "wall" or owner_kind == "column" or owner_kind == "stair"

func _is_floor_surface(collider: Dictionary) -> bool:
	return str(collider.get("kind", "")) == "triangle-mesh" and str(collider.get("id", "")).begins_with("floor:")

func _add_collider_proxy(body: Node3D, owner: Dictionary, collider: Dictionary) -> bool:
	var mesh := MeshInstance3D.new()
	if str(collider.get("kind", "")) == "triangle-mesh":
		var triangle_mesh := _triangle_mesh(collider)
		if triangle_mesh == null:
			return false
		mesh.mesh = triangle_mesh
		mesh.material_override = _material_for_owner(owner, collider)
		body.add_child(mesh)
		return true

	var collision_shape := _direct_collision_shape(body)
	if collision_shape == null or collision_shape.shape == null:
		return false
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
	mesh.material_override = _material_for_owner(owner, collider)
	body.add_child(mesh)
	return true

func _triangle_mesh(collider: Dictionary) -> ArrayMesh:
	var vertices: Array = collider.get("vertices", [])
	var indices: Array = collider.get("indices", [])
	if vertices.size() < 3 or indices.size() < 3 or indices.size() % 3 != 0:
		return null
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for raw_index in indices:
		var index := int(raw_index)
		if index < 0 or index >= vertices.size():
			return null
		surface.add_vertex(_vec3(vertices[index]))
	surface.generate_normals()
	return surface.commit()

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

func _material_for_owner(owner: Dictionary, collider: Dictionary) -> Material:
	match str(owner.get("kind", "")):
		"wall": return _wall_material
		"furniture": return _furniture_material
		"column": return _column_material
		"door": return _door_material
		"stair": return _stair_material
	if _is_floor_surface(collider):
		return _floor_material
	return _wall_material

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
