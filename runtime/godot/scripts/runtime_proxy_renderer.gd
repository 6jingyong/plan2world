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

func add_box(body: Node3D, size: Vector3, owner: Dictionary, architecture_presentation_loaded: bool) -> void:
	if not bool(owner.get("visible", true)):
		return
	if architecture_presentation_loaded and str(owner.get("kind", "")) == "wall":
		return
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.material_override = _material_for_owner(owner)
	body.add_child(mesh)

func add_cylinder(body: Node3D, radius: float, height: float, owner: Dictionary) -> void:
	if not bool(owner.get("visible", true)):
		return
	var mesh := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = radius
	cylinder.bottom_radius = radius
	cylinder.height = height
	mesh.mesh = cylinder
	mesh.material_override = _material_for_owner(owner)
	body.add_child(mesh)

func add_door_leaf(parent: Node3D, size: Vector3, local_center: Vector3) -> void:
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.material_override = _door_material
	mesh.position = local_center
	parent.add_child(mesh)

func add_window_marker(entity: Dictionary, root: Node3D) -> void:
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

func add_room_surfaces(data: Dictionary, root: Node3D) -> void:
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
