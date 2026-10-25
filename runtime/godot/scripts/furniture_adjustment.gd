extends Node

signal state_changed
signal message(text: String)
var active := false
var controller
var player: P2WPlayer
var _held := 0.0
var _analog := false

func configure(camera_controller, actor: P2WPlayer) -> void:
	name = "FurnitureAdjustment"
	controller = camera_controller
	player = actor
	controller.preview_cancelled.connect(cancel)

func _unhandled_input(event: InputEvent) -> void:
	if controller.active or controller.transitioning: return
	if active and event.is_action_pressed("layout_cancel"):
		cancel()
		get_viewport().set_input_as_handled()
	elif active and (event.is_action_pressed("layout_confirm") or event.is_action_pressed("layout_adjust")):
		active = false
		controller.commit_move()
		message.emit("")
		state_changed.emit()
		get_viewport().set_input_as_handled()
	elif not active and event.is_action_pressed("layout_adjust"):
		var id:=aimed_id()
		if controller.begin_adjust(id):
			active = true
			_held = 0
			_analog = false
			state_changed.emit()
			message.emit("Ceiling light · Arrows / left stick move along ceiling · L light settings · F / A place" if controller._entities[id].has("light") else "Adjust furniture · Arrows / left stick · F / A place · Esc / B cancel")
		else:
			message.emit("Aim at an unlocked placed item in an editable Project.")
		get_viewport().set_input_as_handled()
	elif active and event is InputEventKey and event.pressed and not event.echo:
		var step := Vector2.ZERO
		if event.is_action_pressed("layout_left"): step.x = -1
		if event.is_action_pressed("layout_right"): step.x = 1
		if event.is_action_pressed("layout_up"): step.y = -1
		if event.is_action_pressed("layout_down"): step.y = 1
		if not step.is_zero_approx():
			_analog = false
			_held = 0
			_move(step.normalized() * 0.01)
			get_viewport().set_input_as_handled()
	elif active and event is InputEventJoypadMotion:
		_analog = true

func _physics_process(delta: float) -> void:
	if not active: return
	var axis := Input.get_vector("layout_left", "layout_right", "layout_up", "layout_down", 0.2)
	if axis.is_zero_approx():
		_held = 0
		return
	_held += delta
	if _analog or _held > 0.3: _move(axis * 0.08 * delta)

func _move(delta: Vector2) -> void:
	var entity: Dictionary = controller._entities[controller.selected_id]
	var motion: Vector3
	if entity["movement"]["kind"] == "wall":
		var values: Array = entity["movement"]["tangent"]
		motion = Vector3(values[0], 0, values[2]) * delta.x - Vector3.UP * delta.y
	else:
		var right := player.global_basis.x
		var back := player.global_basis.z
		motion = right * delta.x + back * delta.y
	if not controller.preview_delta(motion):
		message.emit("Placement blocked by an obstacle or missing floor support.")

func cancel() -> void:
	if not active: return
	active = false
	controller.cancel_drag()
	message.emit("")
	state_changed.emit()

func aimed_id() -> String:
	var camera:=player.get_node("Camera3D") as Camera3D
	var query:=PhysicsRayQueryParameters3D.create(camera.global_position,camera.global_position-camera.global_basis.z*2.5,3)
	query.collide_with_areas=true;query.exclude=[player.get_rid()]
	var hit:=player.get_world_3d().direct_space_state.intersect_ray(query)
	return "" if hit.is_empty() else str(hit["collider"].get_meta("furniture_id",hit["collider"].get_meta("p2w_owner_id","")))
