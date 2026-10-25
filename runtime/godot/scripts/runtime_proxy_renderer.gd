extends RefCounted
class_name P2WRuntimeProxyRenderer

var _materials := {}

func _init() -> void:
	var colors := { "wall": "d8d4cd", "furniture": "9da9b8", "column": "b7afa3", "door": "8d6448", "floor": "bab2a6", "stair": "c49a6c" }
	for kind in colors:
		_materials[kind] = _material(Color(colors[kind]), 0.85)
	_materials["window"] = _material(Color(0.36, 0.72, 0.92, 0.38), 0.18, true)

func render(
	data: Dictionary,
	root: Node3D,
	build_result: Dictionary,
	architecture_presentation_loaded: bool,
	presented_assets: Dictionary = {},
) -> Dictionary:
	var entities_by_id := {}
	var instances := {}
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
		if presented_assets.has(str(collider.get("ownerId", ""))) or presented_assets.has(str(collider["id"])):
			continue
		var owner: Dictionary = entities_by_id.get(str(collider.get("ownerId", "")), {})
		if not bool(owner.get("visible", true)):
			continue
		var owner_kind := str(owner.get("kind", ""))
		var is_floor_surface := _is_floor_surface(collider)
		if architecture_presentation_loaded and _glb_owns(owner_kind, is_floor_surface):
			static_proxy_suppressed_count += 1
			continue
		var instance := _add_collider_proxy(node as Node3D, owner, collider)
		if instance != null:
			if owner_kind == "furniture":
				instances[str(collider["ownerId"])] = instance
			collider_proxy_count += 1
			if is_floor_surface:
				floor_surface_count += 1

	var window_marker_count := 0
	for raw_entity in data.get("entities", []):
		var entity: Dictionary = raw_entity
		var id := str(entity.get("id", ""))
		var kind := str(entity.get("kind", ""))
		if kind == "furniture" and not presented_assets.has(id) and not collider_nodes.has("furniture:" + id):
			instances[id] = _add_box_marker(id, _vec3(entity["position"]), _vec3(entity["size"]), float(entity["yawClockwiseRadians"]), "furniture", root)
		if kind == "window" and not architecture_presentation_loaded:
			_add_box_marker(id, _vec3(entity["center"]), Vector3(entity["width"], entity["height"], 0.025), float(entity["yawClockwiseRadians"]), "window", root)
			window_marker_count += 1

	return {
		"instances": instances,
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

func _add_collider_proxy(body: Node3D, owner: Dictionary, collider: Dictionary) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	if str(collider.get("kind", "")) == "triangle-mesh":
		var triangle_mesh := _triangle_mesh(collider)
		if triangle_mesh == null:
			return null
		mesh.mesh = triangle_mesh
		mesh.material_override = _material_for_owner(owner, collider)
		body.add_child(mesh)
		return mesh

	var collision_shape := _direct_collision_shape(body)
	if collision_shape == null or collision_shape.shape == null:
		return null
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
		return null
	mesh.transform = collision_shape.transform
	mesh.material_override = _material_for_owner(owner, collider)
	body.add_child(mesh)
	return mesh

func _triangle_mesh(collider: Dictionary) -> ArrayMesh:
	var vertices: Array = collider.get("vertices", [])
	var indices: Array = collider.get("indices", [])
	if vertices.size() < 3 or indices.size() < 3 or indices.size() % 3 != 0:
		return null
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	# The same CCW -> Godot clockwise conversion as runtime physics.
	for triangle in range(0, indices.size(), 3):
		for offset in [0, 2, 1]:
			var index := int(indices[triangle + offset])
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

func _add_box_marker(id: String, center: Vector3, size: Vector3, yaw: float, kind: String, root: Node3D) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	mesh.name = "MissingAsset_%s" % id.validate_node_name()
	mesh.set_meta("p2w_owner_id", id)
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.material_override = _materials[kind]
	mesh.position = center
	mesh.rotation.y = _yaw(yaw)
	root.add_child(mesh)
	return mesh

func _material_for_owner(owner: Dictionary, collider: Dictionary) -> Material:
	var kind := "floor" if _is_floor_surface(collider) else str(owner.get("kind", "wall"))
	return _materials.get(kind, _materials["wall"])

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
