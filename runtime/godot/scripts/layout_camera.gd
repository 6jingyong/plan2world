extends Node3D

signal view_settled
signal view_started
signal furniture_selected(id: String)
signal furniture_moved(id: String, point: Vector3)
signal preview_cancelled
signal placement_blocked
signal snap_changed(text: String)
signal gesture_changed(moving: bool)
signal pose_previewed(id:String, position:Vector3, yaw:float)
signal placement_requested(command:Dictionary)
signal host_picked(kind:String,id:String)

var camera: Camera3D
var data: Dictionary
var floor_id := ""
var selected_id := ""
var editing := false
var transitioning := false
var active := false
var ceiling_editing := false
var display
var inset_top := 96.0
var inset_left := 96.0
var inset_right := 0.0
var inset_bottom := 96.0
var snapping := preload("res://scripts/furniture_snapping.gd").new()
var support := preload("res://scripts/placement_support.gd").new()
var _guides: MeshInstance3D
var _preview_yaw := 0.0
var _drag_point := Vector3.ZERO
var _bypass_snap := false
var _player: P2WPlayer
var _nodes: Dictionary
var _models: Dictionary
var _entities := {}
var _areas: Node3D
var _pick_areas:Dictionary={}
var _door_clearance: Node3D
var _highlight: MeshInstance3D
var _bounds := Rect2()
var _floor_y := 0.0
var _center := Vector2.ZERO
var _size := 20.0
var _framed_viewport := Vector2.ZERO
var _building_height := 0.0
var _tween: Tween
var _panning := false
var _moving := false
var _origin := Vector3.ZERO
var _preview := Vector3.ZERO
var _grab_offset := Vector3.ZERO
var _model: Node3D
var _model_pose := Transform3D.IDENTITY
var _visibility: Array = []
var _pending_command:Dictionary={}
var _pending_scene:Dictionary={}
var _pending_previous:=""
var _pending_model:Node3D
var _pending_visible:=true
var _host_pick:=""

func has_placement_preview() -> bool:return not _pending_command.is_empty()

func begin_placement(command:Dictionary,entity:Dictionary) -> void:
	cancel_drag();_pending_previous=selected_id
	_pending_command=command.duplicate(true);selected_id=entity["id"]
	_pending_scene=data.duplicate();_pending_scene["entities"]=data["entities"].filter(func(item):return item["id"]!=selected_id)+[entity]
	_entities[selected_id]=entity;_origin=_vec3(entity["position"]);_preview=_origin;_drag_point=_origin;_preview_yaw=entity["yawClockwiseRadians"]
	_grab_offset=Vector3(0,_floor_y-_origin.y,0);_model=null;_moving=true
	_pending_model=_models.get(selected_id)
	if is_instance_valid(_pending_model):_pending_visible=_pending_model.visible;_pending_model.hide()
	snapping.clear();gesture_changed.emit(true);_show_preview()

func begin_host_pick(kind:String) -> void:
	cancel_drag();_host_pick=kind

func _pick_host(screen:Vector2) -> void:
	if _host_pick=="wall":
		var from:=camera.project_ray_origin(screen)
		var query:=PhysicsRayQueryParameters3D.create(from,from+camera.project_ray_normal(screen)*1000,1)
		# Top view can see through other floors. Only a hit on an explicit solid,
		# straight wall of this floor can select a wall; no nearest-host fallback.
		var excluded:Array[RID]=[]
		for collider in data["colliders"]:
			var owner:Dictionary=_entities.get(collider["ownerId"],{})
			if owner.get("kind")!="wall" or owner.get("floorId")!=floor_id:
				if _nodes.has(collider["id"]):excluded.append(_nodes[collider["id"]].get_rid())
		query.exclude=excluded
		var hit:=get_world_3d().direct_space_state.intersect_ray(query)
		if hit.is_empty():placement_blocked.emit();return
		var id:String=hit["collider"].get_meta("p2w_owner_id","");var wall:Dictionary=_entities.get(id,{})
		if wall.get("boundaryType")!="solid" or wall["path"].has("control"):placement_blocked.emit();return
		_host_pick="";host_picked.emit("wall",id)
	else:
		var point=_plane_point(screen);if point==null:return
		var matches:Array=[]
		for floor in data["floors"]:
			if floor["id"]!=floor_id:continue
			for room in floor["rooms"]:
				if room["ceilingHeight"]==null or not room.has("ceilingWallIds"):continue
				var polygon:=PackedVector2Array();for p in room["polygon"]:polygon.append(Vector2(p[0],p[1]))
				if not Geometry2D.is_point_in_polygon(Vector2(point.x,point.z),polygon):continue
				var in_hole:=false
				for hole in room["holes"]:
					var ring:=PackedVector2Array();for p in hole:ring.append(Vector2(p[0],p[1]))
					in_hole=in_hole or Geometry2D.is_point_in_polygon(Vector2(point.x,point.z),ring)
				if not in_hole:matches.append(room["id"])
		if matches.size()!=1:placement_blocked.emit();return
		_host_pick="";host_picked.emit("ceiling",matches[0])

func configure(scene: Dictionary, nodes: Dictionary, models: Dictionary, player: P2WPlayer) -> void:
	name = "LayoutCamera"
	set_meta("p2w_editor_overlay",true)
	_player = player
	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.fov = player.get_node("Camera3D").fov
	add_child(camera)
	_highlight = MeshInstance3D.new()
	_highlight.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_highlight.visible = false
	add_child(_highlight)
	_guides = MeshInstance3D.new()
	_guides.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_guides)
	_build_door_clearance(scene)
	refresh(scene, nodes, models)
	select_floor(str(scene["floors"][0]["id"]))

func refresh(scene: Dictionary, nodes: Dictionary, models: Dictionary, changed:Array=[]) -> void:
	cancel_drag()
	data = scene
	if changed.is_empty():support.configure(scene)
	_nodes = nodes
	_models = models
	_entities.clear()
	if _areas != null and changed.is_empty():
		remove_child(_areas)
		_areas.queue_free()
		_areas=null;_pick_areas.clear()
	if _areas==null:
		_areas = Node3D.new();add_child(_areas)
	for id in changed:
		if _pick_areas.has(id):
			var old:Node=_pick_areas[id];_areas.remove_child(old);old.queue_free();_pick_areas.erase(id)
	for entity in scene["entities"]:
		_entities[entity["id"]] = entity
		if entity["kind"] not in ["furniture","door","window"] or entity.get("doorType")=="opening":
			continue
		if not changed.is_empty() and not changed.has(entity["id"]):continue
		var area := Area3D.new()
		area.collision_layer = 2 if not active or entity["floorId"] == floor_id else 0
		area.collision_mask = 0
		area.set_meta("furniture_id", entity["id"])
		area.set_meta("floor_id", entity["floorId"])
		var furniture:bool=entity["kind"]=="furniture"
		var pose:Dictionary=entity.get("closedPose",{})
		area.position = _vec3(entity["position"] if furniture else pose.get("center",entity.get("center",[0,0,0])))
		area.rotation.y = -float(entity["yawClockwiseRadians"] if furniture else pose.get("yawClockwiseRadians",entity.get("yawClockwiseRadians",0)))
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		var host:Dictionary=_entities.get(entity.get("hostWallId",""),{})
		box.size = _vec3(entity["size"]).max(Vector3(0.05, 0.05, 0.05)) if furniture else Vector3(entity["width"],entity["height"],maxf(.08,host.get("thickness",.15)))
		shape.shape = box
		area.add_child(shape)
		_areas.add_child(area)
		_pick_areas[entity["id"]]=area
	update_floor_visibility(changed.is_empty())

func _build_door_clearance(scene: Dictionary) -> void:
	if _door_clearance!=null:remove_child(_door_clearance);_door_clearance.queue_free()
	# Placement-only copies of the compiler's closed-pose colliders. Layer 4
	# never blocks locomotion, door animation, floor rays or furniture picking.
	_door_clearance = Node3D.new()
	_door_clearance.name = "ClosedDoorClearance"
	add_child(_door_clearance)
	var door_ids := {}
	for entity in scene["entities"]:
		if entity["kind"] == "door": door_ids[entity["id"]] = true
	for collider in scene["colliders"]:
		if collider["kind"] != "box" or not door_ids.has(collider["ownerId"]): continue
		var area := Area3D.new()
		area.collision_layer = 4
		area.collision_mask = 0
		area.position = _vec3(collider["center"])
		area.rotation.y = -float(collider["yawClockwiseRadians"])
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = _vec3(collider["size"])
		shape.shape = box
		area.add_child(shape)
		_door_clearance.add_child(area)

func select_floor(id: String) -> void:
	cancel_drag()
	floor_id = id
	selected_id = ""
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
	fit_floor()
	update_floor_visibility()

func view_center() -> Vector2:
	return _center

func _fit_size(viewport := Vector2.ZERO) -> float:
	if viewport == Vector2.ZERO: viewport = get_viewport().get_visible_rect().size
	var aspect := maxf(viewport.x, 1) / maxf(viewport.y, 1)
	var usable := maxf(0.2, 1.0 - (inset_top + inset_bottom) / maxf(viewport.y, 1))
	var usable_width := maxf(0.2, 1.0 - (inset_left + inset_right) / maxf(viewport.x, 1))
	# Orthographic size is the vertical world span, independent of height/FOV.
	return maxf(4, maxf(_bounds.size.x / (aspect * usable_width), _bounds.size.y / usable) * 1.15)

func fit_floor() -> void:
	cancel_drag()
	_center = _bounds.get_center()
	_size = _fit_size()
	_framed_viewport = get_viewport().get_visible_rect().size
	if active: _animate(_top_pose())

func set_view_insets(left: float, right: float, top: float, bottom: float) -> void:
	var previous_fit := _fit_size(_framed_viewport)
	cancel_drag()
	inset_left = left; inset_right = right; inset_top = top; inset_bottom = bottom
	# Opening the catalog shifts/zooms the camera while preserving the user's
	# current plan centre and relative zoom. It never resets the chosen location.
	_size *= _fit_size() / previous_fit
	_framed_viewport = get_viewport().get_visible_rect().size
	if active: _animate(_top_pose())

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
	var viewport := get_viewport().get_visible_rect().size
	var scale := _size / (2 * maxf(viewport.y, 1))
	return Transform3D(Basis.from_euler(Vector3(-PI / 2, 0, 0)), Vector3(_center.x + scale * (inset_right - inset_left), _floor_y + _view_height(), _center.y - scale * (inset_top - inset_bottom)))

func _view_height() -> float:
	return maxf(_building_height + 8, _size)

func _plan_fov() -> float:
	return rad_to_deg(2 * atan(_size / (2 * _view_height())))

func _animate(target: Transform3D) -> void:
	if _tween != null:
		_tween.kill()
	var source := camera.global_transform
	var source_size := camera.size
	# Match the floor-plane framing at projection boundaries. In settled plan
	# mode, every height has the same scale; only the transition uses perspective.
	if not active and camera.projection == Camera3D.PROJECTION_ORTHOGONAL:
		camera.projection = Camera3D.PROJECTION_PERSPECTIVE
		camera.fov = _plan_fov()
	var source_fov := camera.fov
	var target_fov: float = _plan_fov() if active else _player.get_node("Camera3D").fov
	transitioning = true
	view_started.emit()
	_tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_tween.tween_method(func(weight: float):
		camera.global_transform = source.interpolate_with(target, weight)
		camera.size = lerpf(source_size, _size, weight)
		camera.fov = lerpf(source_fov, target_fov, weight), 0.0, 1.0, 0.45)
	_tween.tween_callback(func():
		transitioning = false
		if active:
			camera.projection = Camera3D.PROJECTION_ORTHOGONAL
			camera.size = _size
		else:
			update_floor_visibility()
			_player.get_node("Camera3D").make_current()
		view_settled.emit())

func update_floor_visibility(restyle:=true) -> void:
	for area in _areas.get_children():
		var ceiling:bool=_entities[area.get_meta("furniture_id")].get("movement",{}).get("kind")=="ceiling"
		area.collision_layer = 2 if not active or (area.get_meta("floor_id")==floor_id and ceiling==ceiling_editing) else 0
	for saved in _visibility:
		if is_instance_valid(saved[0]):
			saved[0].visible = saved[1]
	_visibility.clear()
	if display!=null and restyle:display.apply(active)
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
			if _entities.has(owner) and _entities[owner]["kind"]=="furniture":
				node.visible=node.visible and (_entities[owner]["movement"]["kind"]=="ceiling")==ceiling_editing
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
	if event is InputEventKey and event.keycode == KEY_ALT:
		_bypass_snap = event.pressed
		if _moving: _snap_preview()
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel_drag()
		get_viewport().set_input_as_handled()
	if event is InputEventMouseButton:
		if event.button_index in [MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT]:
			_panning = event.pressed
		elif event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			_size = clampf(_size * (1.0 / 1.15 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.15), 2, 400)
			camera.size = _size
			camera.global_transform = _top_pose()
		elif event.button_index == MOUSE_BUTTON_LEFT and editing:
			if event.pressed:
				if not _host_pick.is_empty():_pick_host(event.position)
				elif has_placement_preview():commit_move()
				else:_pick(event.position)
			elif _moving:
				commit_move()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		var point = _plane_point(event.position)
		if _moving and point != null:
			_drag_point = constrained_position(point - _grab_offset)
			_bypass_snap = event.alt_pressed
			_snap_preview()
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
	var id := "" if hit.is_empty() else str(hit["collider"].get_meta("furniture_id"))
	if begin_adjust(id):
		var point = _plane_point(screen)
		_grab_offset = point - _origin

func begin_adjust(id: String) -> bool:
	cancel_drag()
	if _entities.has(id) and _entities[id]["floorId"] != floor_id:
		select_floor(_entities[id]["floorId"])
	selected_id = id if _entities.has(id) and _entities[id]["kind"] in ["furniture","door","window"] else ""
	furniture_selected.emit(selected_id)
	if not editing or not _entities.has(id) or _entities[id]["kind"] != "furniture": return false
	var entity: Dictionary = _entities[id]
	if entity.get("locked", false) or entity["movement"]["kind"] == "unbound-wall": return false
	_origin = _vec3(entity["position"])
	_preview = _origin
	_drag_point = _origin
	_preview_yaw = float(entity["yawClockwiseRadians"])
	_bypass_snap = false
	snapping.clear()
	_model = _models.get(id)
	if _model != null:
		_model_pose = _model.global_transform
	_moving = true
	gesture_changed.emit(true)
	_highlight_selected(Color.GREEN)
	return true

func constrained_position(point: Vector3) -> Vector3:
	var entity: Dictionary = _entities[selected_id]
	var motion: Dictionary = entity["movement"]
	if motion["kind"] in ["floor","ceiling"]:
		return Vector3(point.x, _origin.y, point.z)
	var origin := _vec3(motion["origin"])
	var tangent := _vec3(motion["tangent"])
	var along := clampf((point - origin).dot(tangent), motion["along"][0], motion["along"][1])
	var half_height := float(entity["size"][1]) / 2
	var bottom := clampf(point.y - origin.y - half_height, motion["bottom"][0], motion["bottom"][1])
	return origin + tangent * along + Vector3.UP * (bottom + half_height)

func preview_delta(delta: Vector3) -> bool:
	var next := constrained_position(_preview + delta)
	if not placement_allowed(data, selected_id, next - _origin): return false
	_preview = next
	_preview_yaw = float(_entities[selected_id]["yawClockwiseRadians"])
	_guides.hide()
	snap_changed.emit("")
	_show_preview()
	return true

func set_snapping(enabled: bool, grid: bool) -> void:
	snapping.enabled = enabled
	snapping.grid_enabled = grid
	snapping.clear()
	if active and _moving: _snap_preview()

func _snap_preview() -> void:
	var entity: Dictionary = _entities[selected_id]
	var result: Dictionary = snapping.solve(data, entity, _drag_point, float(entity["yawClockwiseRadians"]), _bypass_snap)
	_preview = result.point
	_preview_yaw = result.yaw
	# A magnetic candidate cannot override physics, floor support or door rules.
	if not result.label.is_empty() and not _preview_allowed():
		_preview = _drag_point
		_preview_yaw = float(entity["yawClockwiseRadians"])
		result.label = "Snap blocked · free placement"
		result.guides = []
		snapping.clear()
	_draw_guides(result.guides)
	snap_changed.emit("Free placement" if _bypass_snap or not snapping.enabled else result.label)
	_show_preview()

func _draw_guides(lines: Array) -> void:
	_guides.hide()
	if lines.is_empty(): return
	var mesh := ImmediateMesh.new()
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = Color("327e70")
	material.no_depth_test = true
	mesh.surface_begin(Mesh.PRIMITIVE_LINES, material)
	for line in lines:
		mesh.surface_add_vertex(line[0])
		mesh.surface_add_vertex(line[1])
	mesh.surface_end()
	_guides.mesh = mesh
	_guides.show()

func _show_preview() -> void:
	if not has_placement_preview():pose_previewed.emit(selected_id,_preview,_preview_yaw)
	if is_instance_valid(_model):
		_model.global_transform = Transform3D(Basis(Vector3.UP, -(_preview_yaw - float(_entities[selected_id]["yawClockwiseRadians"]))) * _model_pose.basis, _model_pose.origin + _preview - _origin)
	_highlight_selected(Color.GREEN if _preview_allowed() else Color.RED)

func commit_move() -> void:
	if not _moving or not _entities.has(selected_id):return
	if has_placement_preview():
		if not _preview_allowed():placement_blocked.emit();return
		var command:=_pending_command.duplicate(true)
		command["position"]={"x":_preview.x*100,"y":_preview.z*100}
		if _entities[selected_id]["movement"]["kind"]!="wall":command["rotation"]=rad_to_deg(_preview_yaw)
		cancel_drag();placement_requested.emit(command);return
	_moving = false
	gesture_changed.emit(false)
	if _preview.distance_to(_origin) <= 0.00001 and is_equal_approx(_preview_yaw, float(_entities[selected_id]["yawClockwiseRadians"])):
		cancel_drag()
		return
	if _preview_allowed():
		furniture_moved.emit(selected_id, _preview)
	else:
		cancel_drag()
		placement_blocked.emit()

func move_command(id: String, point: Vector3) -> Dictionary:
	var entity: Dictionary = _entities[id]
	var command := { "type": "move", "id": id, "floorId": entity["floorId"], "position": { "x": point.x * 100, "y": point.z * 100 } }
	if entity["movement"]["kind"] == "wall":
		command["elevation"] = (point.y - float(entity["size"][1]) / 2 - float(entity["movement"]["origin"][1])) * 100
	elif id == selected_id and not is_equal_approx(_preview_yaw, float(entity["yawClockwiseRadians"])):
		command["rotation"] = rad_to_deg(_preview_yaw)
	return command

func cancel_drag() -> void:
	var was_moving := _moving
	_host_pick=""
	if has_placement_preview():
		if is_instance_valid(_pending_model):_pending_model.visible=_pending_visible
		var old:Dictionary={}
		for entity in data["entities"]:
			if entity["id"]==selected_id:old=entity;break
		if old.is_empty():_entities.erase(selected_id)
		else:_entities[selected_id]=old
		selected_id=_pending_previous if _entities.has(_pending_previous) else ""
		_pending_command={};_pending_scene={};_pending_model=null
	_panning = false
	_moving = false
	if is_instance_valid(_model):
		_model.global_transform = _model_pose
		pose_previewed.emit(selected_id,_origin,float(_entities[selected_id]["yawClockwiseRadians"]))
	_model = null
	snapping.clear()
	_bypass_snap = false
	if _guides != null: _guides.hide()
	snap_changed.emit("")
	if _highlight != null:
		_highlight.hide()
	if was_moving:
		gesture_changed.emit(false)
		preview_cancelled.emit()

func _preview_allowed() -> bool:
	return placement_allowed(_pending_scene if has_placement_preview() else data, selected_id, (_preview - _origin), _preview_yaw)

func placement_allowed(scene: Dictionary, id: String, offset := Vector3.ZERO, yaw_override = null) -> bool:
	var entity: Dictionary = {}
	for item in scene["entities"]:
		if item["id"] == id: entity = item; break
	if entity.is_empty() or entity.get("locked", false) or entity["movement"]["kind"] == "unbound-wall": return false
	var pose := _vec3(entity["position"]) + offset
	var yaw := float(entity["yawClockwiseRadians"]) if yaw_override == null else float(yaw_override)
	var movement: Dictionary = entity["movement"]
	if movement["kind"] in ["floor","ceiling"] and not _floor_support(entity, pose, yaw): return false
	# Source anchors have no observed physical extent. Their arbitrary selectable
	# block must not acquire an obstacle query during editing either.
	if entity.get("representation")=="source-marker" and movement["kind"]=="floor":return true
	if movement["kind"]=="ceiling" and absf(pose.y+float(entity["size"][1])/2-float(movement["elevation"]))>.00001:return false
	if movement["kind"] == "wall":
		var origin := _vec3(movement["origin"])
		var along := (pose-origin).dot(_vec3(movement["tangent"]))
		var half_width := float(entity["size"][0])/2
		var bottom := pose.y-origin.y-float(entity["size"][1])/2
		for opening in movement["blocked"]:
			if along+half_width > opening["along"][0]+0.00001 and along-half_width < opening["along"][1]-0.00001 and bottom+float(entity["size"][1]) > opening["bottom"][0]+0.00001 and bottom < opening["bottom"][1]-0.00001: return false
	var exclusions: Array[RID] = []
	var room_ids := {}
	for floor in data["floors"]:
		for room in floor["rooms"]: room_ids[room["id"]] = true
	for collider in data["colliders"]:
		if (room_ids.has(collider["ownerId"]) or collider["ownerId"] == id) and _nodes.has(collider["id"]):
			exclusions.append(_nodes[collider["id"]].get_rid())
	# Real furniture, including thin rugs, retains its complete placement bounds.
	var shape := BoxShape3D.new()
	shape.size = _vec3(entity["size"]).max(Vector3(0.001,0.001,0.001)) * 0.999
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis(Vector3.UP, -yaw), pose)
	query.collision_mask = 5
	query.collide_with_areas = true
	query.exclude = exclusions
	query.margin = 0.0
	return get_world_3d().direct_space_state.intersect_shape(query, 1).is_empty()

func _floor_support(entity: Dictionary, pose: Vector3, yaw: float) -> bool:
	return support.allowed(entity,pose,yaw)

func set_ceiling_layer(value:bool) -> void:
	cancel_drag();ceiling_editing=value;selected_id="";furniture_selected.emit("");update_floor_visibility()

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
	_highlight.global_transform = Transform3D(Basis(Vector3.UP, -_preview_yaw), _preview)
	_highlight.show()

func _vec3(value: Array) -> Vector3:
	return Vector3(value[0], value[1], value[2])
