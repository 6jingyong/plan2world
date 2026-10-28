extends CharacterBody3D
class_name P2WPlayer

var eye_height := 1.6
var radius := 0.28
var slow_speed := 0.6
var walk_speed := 1.2
var fast_speed := 2.4
var mouse_sensitivity := 0.0022
var interaction_enabled := true
var _pitch := 0.0
var _gravity := float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.8))
var _camera: Camera3D
var _interaction_cast: ShapeCast3D

func configure(profile: Dictionary, spawn: Vector3, yaw = null) -> void:
	collision_mask=1|8
	eye_height = float(profile.get("eyeHeight", 1.6))
	radius = float(profile.get("radius", 0.28))
	var speeds: Dictionary = profile.get("speeds", {})
	slow_speed = float(speeds.get("slow", 0.6))
	walk_speed = float(speeds.get("walk", 1.2))
	fast_speed = float(speeds.get("fast", 2.4))
	up_direction = Vector3.UP
	floor_snap_length = max(0.05, radius * 0.5)
	_build_body()
	respawn(spawn, yaw)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

# Explicit user recovery only. The compiler's spawn is the entire authority;
# holes remain holes and no floor/target elevation is inferred by the player.
func respawn(spawn: Vector3, yaw = null) -> void:
	position = spawn
	velocity = Vector3.ZERO
	rotation = Vector3(0, -float(yaw) - PI / 2, 0) if yaw != null else Vector3.ZERO
	_pitch = 0.0
	_camera.rotation = Vector3.ZERO
	reset_physics_interpolation()

func _build_body() -> void:
	if get_node_or_null("CollisionShape3D") == null:
		var collider := CollisionShape3D.new()
		collider.name = "CollisionShape3D"
		var capsule := CapsuleShape3D.new()
		capsule.radius = radius
		capsule.height = max(1.2, eye_height)
		collider.shape = capsule
		collider.position.y = capsule.height * 0.5
		add_child(collider)
	if get_node_or_null("Camera3D") == null:
		_camera = Camera3D.new()
		_camera.name = "Camera3D"
		_camera.position.y = eye_height
		_camera.current = true
		add_child(_camera)
		_interaction_cast = ShapeCast3D.new()
		_interaction_cast.name = "InteractionCast"
		# A small aim tolerance crosses real leaf seams and floating-point gaps.
		# This is an input query, never a change to the compiler's door collision.
		var probe := SphereShape3D.new()
		probe.radius = 0.015
		_interaction_cast.shape = probe
		_interaction_cast.target_position = Vector3(0, 0, -2.5)
		_interaction_cast.enabled = false
		_interaction_cast.collide_with_bodies = true
		_interaction_cast.collide_with_areas = false
		_interaction_cast.add_exception(self)
		_camera.add_child(_interaction_cast)
	else:
		_camera = get_node("Camera3D") as Camera3D
		_interaction_cast = _camera.get_node("InteractionCast") as ShapeCast3D

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * mouse_sensitivity)
		_pitch = clamp(_pitch - event.relative.y * mouse_sensitivity, deg_to_rad(-85.0), deg_to_rad(85.0))
		_camera.rotation.x = _pitch
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
		elif event.physical_keycode == KEY_E and interaction_enabled:
			interact()

	elif event is InputEventJoypadButton and event.is_action_pressed("layout_confirm") and interaction_enabled:
		interact()

func _process(delta: float) -> void:
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED or not is_processing_unhandled_input(): return
	var look := Input.get_vector("look_left", "look_right", "look_up", "look_down", 0.2)
	rotate_y(-look.x * 1.8 * delta)
	_pitch = clampf(_pitch - look.y * 1.8 * delta, deg_to_rad(-85), deg_to_rad(85))
	_camera.rotation.x = _pitch

func _physics_process(delta: float) -> void:
	var input_2d := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var speed := walk_speed
	if Input.is_action_pressed("move_slow"):
		speed = slow_speed
	elif Input.is_action_pressed("move_fast"):
		speed = fast_speed
	var local_motion := Vector3(input_2d.x, 0.0, input_2d.y)
	var world_motion := global_transform.basis * local_motion
	velocity.x = world_motion.x * speed
	velocity.z = world_motion.z * speed
	if is_on_floor():
		if velocity.y < 0.0:
			velocity.y = 0.0
	else:
		velocity.y -= _gravity * delta
	move_and_slide()

func interact() -> void:
	if not _interaction_cast:
		return
	_interaction_cast.force_shapecast_update()
	if not _interaction_cast.is_colliding():
		return
	var target := _interaction_cast.get_collider(0)
	if target is Node:
		target = target.get_meta("p2w_interaction_target", target)
	if target and target.has_method("interact"):
		target.interact(self)
