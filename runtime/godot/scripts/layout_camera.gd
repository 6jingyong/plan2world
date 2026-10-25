extends Node3D

signal view_settled
signal view_started
signal furniture_selected(id: String)
signal furniture_moved(id: String, point: Vector2)
signal placement_blocked

var camera: Camera3D
var data: Dictionary
var floor_id := ""
var selected_id := ""
var editing := false
var transitioning := false
var active := false
var inset_top := 120.0
var _player: P2WPlayer
var _nodes: Dictionary
var _models: Dictionary
var _entities := {}
var _areas: Node3D
var _highlight: MeshInstance3D
var _bounds := Rect2()
var _floor_y := 0.0
var _center := Vector2.ZERO
var _height := 20.0
var _building_height := 0.0
var _tween: Tween
var _panning := false
var _moving := false
var _origin := Vector2.ZERO
var _preview := Vector2.ZERO
var _grab_offset := Vector2.ZERO
var _model: Node3D
var _model_pose := Transform3D.IDENTITY
var _visibility: Array = []

func configure(scene: Dictionary, nodes: Dictionary, models: Dictionary, player: P2WPlayer) -> void:
	name = "LayoutCamera"
	_player = player
	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.fov = player.get_node("Camera3D").fov
	add_child(camera)
	_highlight = MeshInstance3D.new()
	_highlight.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_highlight.visible = false
	add_child(_highlight)
	refresh(scene, nodes, models)
	select_floor(str(scene["floors"][0]["id"]))

func refresh(scene: Dictionary, nodes: Dictionary, models: Dictionary) -> void:
	cancel_drag()
	data = scene
	_nodes = nodes
	_models = models
	_entities.clear()
	if _areas != null:
		remove_child(_areas)
		_areas.queue_free()
	_areas = Node3D.new()
	add_child(_areas)
	for entity in scene["entities"]:
		_entities[entity["id"]] = entity
		if entity["kind"] != "furniture":
			continue
		var area := Area3D.new()
		area.collision_layer = 2 if entity["floorId"] == floor_id else 0
		area.collision_mask = 0
		area.set_meta("furniture_id", entity["id"])
		area.set_meta("floor_id", entity["floorId"])
		area.position = _vec3(entity["position"])
		area.rotation.y = -float(entity["yawClockwiseRadians"])
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = _vec3(entity["size"]).max(Vector3(0.05, 0.05, 0.05))
		shape.shape = box
		area.add_child(shape)
		_areas.add_child(area)
	update_floor_visibility()

func select_floor(id: String) -> void:
	floor_id = id
	selected_id = ""
	cancel_drag()
	furniture_selected.emit("")
	var points: Array[Vector2] = []
	_building_height = 0.0
	for floor in data["floors"]:
		if floor["id"] != id:
			continue
		_floor_y = float(floor["elevation"])
		for room in floor["rooms"]:
			for point in room["polygon"]:
				points.append(Vector2(point[0], point[1]))
	for entity in data["entities"]:
		if entity["floorId"] == id and entity["kind"] == "wall":
			_building_height = maxf(_building_height, maxf(entity["startHeight"], entity["endHeight"]))
	_bounds = Rect2(points[0], Vector2.ZERO) if not points.is_empty() else Rect2(-1, -1, 2, 2)
	for point in points:
		_bounds = _bounds.expand(point)
	for area in _areas.get_children():
		area.collision_layer = 2 if area.get_meta("floor_id") == id else 0
	fit_floor()
	update_floor_visibility()

func view_center() -> Vector2:
	return _center

func fit_floor() -> void:
	_center = _bounds.get_center()
	var viewport := get_viewport().get_visible_rect().size
	var aspect := maxf(viewport.x, 1) / maxf(viewport.y, 1)
	var usable := maxf(0.2, 1.0 - inset_top / maxf(viewport.y, 1))
	# Fit wall tops as well as the floor, below the native toolbar. No model
	# bounds or collision-derived presentation are needed to frame the room.
	_height = maxf(6, _building_height + maxf(_bounds.size.x / aspect, _bounds.size.y / usable) / (2 * tan(deg_to_rad(camera.fov) / 2)) * 1.15)
	if active:
		_animate(_top_pose())

func set_plan_mode(value: bool) -> void:
	if active == value:
		return
	cancel_drag()
	if not active and not transitioning:
		camera.global_transform = _player.get_node("Camera3D").global_transform
	active = value
	camera.make_current()
	if active:
		update_floor_visibility()
	_animate(_top_pose() if active else _player.get_node("Camera3D").global_transform)

func _top_pose() -> Transform3D:
	var offset := _height * tan(deg_to_rad(camera.fov) / 2) * inset_top / maxf(get_viewport().get_visible_rect().size.y, 1)
	return Transform3D(Basis.from_euler(Vector3(-PI / 2, 0, 0)), Vector3(_center.x, _floor_y + _height, _center.y - offset))

func _animate(target: Transform3D) -> void:
	if _tween != null:
		_tween.kill()
	var source := camera.global_transform
	transitioning = true
	view_started.emit()
	_tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_tween.tween_method(func(weight: float): camera.global_transform = source.interpolate_with(target, weight), 0.0, 1.0, 0.45)
	_tween.tween_callback(func():
		transitioning = false
		if not active:
			update_floor_visibility()
			_player.get_node("Camera3D").make_current()
		view_settled.emit())

func update_floor_visibility() -> void:
	for saved in _visibility:
		if is_instance_valid(saved[0]):
			saved[0].visible = saved[1]
	_visibility.clear()
	if not active or data.is_empty():
		return
	var owners := {}
	for entity in data["entities"]:
		owners[entity["id"]] = entity["floorId"]
	for floor in data["floors"]:
		for room in floor["rooms"]:
			owners[room["id"]] = floor["id"]
	_filter_visibility(get_parent(), owners)

func _filter_visibility(node: Node, owners: Dictionary, architecture := false) -> void:
	if node == self:
		return
	if node is Node3D:
		var metadata: Dictionary = node.get_meta("extras", {}).get("plan2world", {}) if architecture else {}
		var owner := str(node.get_meta("p2w_owner_id", ""))
		if not metadata.is_empty():
			_visibility.append([node, node.visible])
			node.visible = node.visible and metadata.get("floorId") == floor_id and metadata.get("kind") != "ceiling"
			return
		elif owners.has(owner):
			_visibility.append([node, node.visible])
			node.visible = node.visible and owners[owner] == floor_id
			return
	for child in node.get_children():
		_filter_visibility(child, owners, architecture or child == get_parent().get_node_or_null("Architecture"))

func _plane_point(screen: Vector2):
	return Plane(Vector3.UP, _floor_y).intersects_ray(camera.project_ray_origin(screen), camera.project_ray_normal(screen))

func _input(event: InputEvent) -> void:
	# Releases over a toolbar never reach _unhandled_input. End pan regardless;
	# dropping furniture over UI cancels the preview instead of leaving it held.
	if event is InputEventMouseButton and not event.pressed:
		if event.button_index in [MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT]:
			_panning = false
		elif event.button_index == MOUSE_BUTTON_LEFT and _moving and get_viewport().gui_get_hovered_control() != null:
			cancel_drag()

func _unhandled_input(event: InputEvent) -> void:
	if not active or transitioning:
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel_drag()
		get_viewport().set_input_as_handled()
	if event is InputEventMouseButton:
		if event.button_index in [MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT]:
			_panning = event.pressed
		elif event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			_height = clampf(_height * (1.0 / 1.15 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.15), 4, 200)
			camera.global_transform = _top_pose()
		elif event.button_index == MOUSE_BUTTON_LEFT and editing:
			if event.pressed:
				_pick(event.position)
			elif _moving:
				_moving = false
				if _preview.distance_to(_origin) > 0.0001:
					if _preview_allowed():
						furniture_moved.emit(selected_id, _preview)
					else:
						cancel_drag()
						placement_blocked.emit()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		var point = _plane_point(event.position)
		if _moving and point != null:
			_preview = Vector2(point.x, point.z) - _grab_offset
			if is_instance_valid(_model):
				_model.global_position = _model_pose.origin + Vector3(_preview.x - _origin.x, 0, _preview.y - _origin.y)
			_highlight_selected(Color.GREEN if _preview_allowed() else Color.RED)
		elif _panning and point != null:
			var previous = _plane_point(event.position - event.relative)
			if previous != null:
				_center += Vector2(previous.x - point.x, previous.z - point.z)
				camera.global_transform = _top_pose()

func _pick(screen: Vector2) -> void:
	cancel_drag()
	var from := camera.project_ray_origin(screen)
	var query := PhysicsRayQueryParameters3D.create(from, from + camera.project_ray_normal(screen) * 1000, 2)
	query.collide_with_bodies = false
	query.collide_with_areas = true
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	selected_id = "" if hit.is_empty() else str(hit["collider"].get_meta("furniture_id"))
	furniture_selected.emit(selected_id)
	if selected_id.is_empty():
		return
	var entity: Dictionary = _entities[selected_id]
	_origin = Vector2(entity["position"][0], entity["position"][2])
	_preview = _origin
	var point = _plane_point(screen)
	_grab_offset = Vector2(point.x, point.z) - _origin
	_model = _models.get(selected_id)
	if _model != null:
		_model_pose = _model.global_transform
	_moving = true
	_highlight_selected(Color.GREEN)

func cancel_drag() -> void:
	_panning = false
	_moving = false
	if is_instance_valid(_model):
		_model.global_transform = _model_pose
	_model = null
	if _highlight != null:
		_highlight.hide()

func _preview_allowed() -> bool:
	return placement_allowed(data, selected_id, Vector3(_preview.x - _origin.x, 0, _preview.y - _origin.y))

func placement_allowed(scene: Dictionary, id: String, offset := Vector3.ZERO) -> bool:
	var rooms := {}
	for floor in data["floors"]:
		for room in floor["rooms"]:
			rooms[room["id"]] = true
	var exclusions: Array[RID] = []
	for collider in data["colliders"]:
		if (rooms.has(collider["ownerId"]) or collider["ownerId"] == id) and _nodes.has(collider["id"]):
			exclusions.append(_nodes[collider["id"]].get_rid())
	for collider in scene["colliders"]:
		if collider["ownerId"] != id or collider["kind"] != "box":
			continue
		var shape := BoxShape3D.new()
		shape.size = _vec3(collider["size"])
		var query := PhysicsShapeQueryParameters3D.new()
		query.shape = shape
		query.transform = Transform3D(Basis(Vector3.UP, -float(collider["yawClockwiseRadians"])), _vec3(collider["center"]) + offset)
		query.collision_mask = 1
		query.exclude = exclusions
		query.margin = 0.001
		return get_world_3d().direct_space_state.intersect_shape(query, 1).is_empty()
	return true

func _highlight_selected(color: Color) -> void:
	var entity: Dictionary = _entities[selected_id]
	var box := BoxMesh.new()
	box.size = _vec3(entity["size"]) * 1.02
	_highlight.mesh = box
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = Color(color, 0.2)
	_highlight.material_override = material
	_highlight.global_transform = Transform3D(Basis(Vector3.UP, -float(entity["yawClockwiseRadians"])), _vec3(entity["position"]) + Vector3(_preview.x - _origin.x, 0, _preview.y - _origin.y))
	_highlight.show()

func _vec3(value: Array) -> Vector3:
	return Vector3(value[0], value[1], value[2])
