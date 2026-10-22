extends CharacterBody3D
class_name P2WPlayer

var eye_height := 1.6
var radius := 0.28
var slow_speed := 0.6
var walk_speed := 1.2
var fast_speed := 2.4
var mouse_sensitivity := 0.0022
var _pitch := 0.0
var _locked_y := 0.0
var _camera: Camera3D
var _interaction_ray: RayCast3D

func configure(profile: Dictionary, spawn: Vector3) -> void:
	eye_height = float(profile.get("eyeHeight", 1.6))
	radius = float(profile.get("radius", 0.28))
	var speeds: Dictionary = profile.get("speeds", {})
	slow_speed = float(speeds.get("slow", 0.6))
	walk_speed = float(speeds.get("walk", 1.2))
	fast_speed = float(speeds.get("fast", 2.4))
	position = spawn
	_locked_y = spawn.y
	_build_body()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

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
		_interaction_ray = RayCast3D.new()
		_interaction_ray.name = "InteractionRay"
		_interaction_ray.target_position = Vector3(0, 0, -2.5)
		_interaction_ray.collide_with_bodies = true
		_interaction_ray.collide_with_areas = false
		_camera.add_child(_interaction_ray)
	else:
		_camera = get_node("Camera3D") as Camera3D
		_interaction_ray = _camera.get_node("InteractionRay") as RayCast3D

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * mouse_sensitivity)
		_pitch = clamp(_pitch - event.relative.y * mouse_sensitivity, deg_to_rad(-85.0), deg_to_rad(85.0))
		_camera.rotation.x = _pitch
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
		elif event.physical_keycode == KEY_E:
			interact()

func _physics_process(_delta: float) -> void:
	var input_2d := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_A): input_2d.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D): input_2d.x += 1.0
	if Input.is_physical_key_pressed(KEY_W): input_2d.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S): input_2d.y += 1.0
	if input_2d.length_squared() > 1.0:
		input_2d = input_2d.normalized()
	var speed := walk_speed
	if Input.is_physical_key_pressed(KEY_CTRL):
		speed = slow_speed
	elif Input.is_physical_key_pressed(KEY_SHIFT):
		speed = fast_speed
	var local_motion := Vector3(input_2d.x, 0.0, input_2d.y)
	var world_motion := global_transform.basis * local_motion
	velocity.x = world_motion.x * speed
	velocity.z = world_motion.z * speed
	velocity.y = 0.0
	move_and_slide()
	global_position.y = _locked_y

func interact() -> void:
	if not _interaction_ray:
		return
	_interaction_ray.force_raycast_update()
	if not _interaction_ray.is_colliding():
		return
	var target := _interaction_ray.get_collider()
	if target and target.has_method("interact"):
		target.interact(self)
