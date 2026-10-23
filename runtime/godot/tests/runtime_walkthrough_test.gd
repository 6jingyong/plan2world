extends SceneTree

const ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const LOADER := preload("res://scripts/runtime_loader.gd")
const ASSETS := preload("res://scripts/runtime_asset_renderer.gd")
var player: P2WPlayer
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message + (" position=" + str(player.position) if player != null else ""))

func _key(pressed: bool) -> void:
	if pressed:
		Input.action_press("move_forward")
	else:
		Input.action_release("move_forward")

func _frames(count: int) -> void:
	for i in range(count):
		await physics_frame

func _walk(frames: int) -> void:
	_key(true)
	await _frames(frames)
	_key(false)
	await _frames(2)

func _place(point: Vector3, yaw: float = 0.0) -> void:
	player.position = point
	player.velocity = Vector3.ZERO
	player.rotation.y = yaw
	await _frames(12)

func _run() -> void:
	var artifacts := ARTIFACTS.new()
	var path := artifacts.runtime_path_from_args()
	var data := artifacts.load_runtime(path)
	var world := Node3D.new()
	root.add_child(world)
	var architecture := artifacts.load_architecture(artifacts.default_architecture_path(path))
	_check(architecture != null, "Native export must load architecture GLB")
	if architecture != null:
		world.add_child(architecture)
	var built := LOADER.new().build(data, world)
	var presentation := ASSETS.new().render(data, world, built, artifacts.load_assets(path))
	_check(presentation["presented"].size() == 4, "Furniture and both dynamic doors must load assets")
	player = P2WPlayer.new()
	world.add_child(player)
	var spawn: Array = data["floors"][0]["walkthroughStart"]
	player.configure(data["playerProfile"], Vector3(spawn[0],spawn[1],spawn[2]))
	await _frames(30)
	_check(player.is_on_floor() and absf(player.position.y - 0.4) < 0.02, "Player must ground at authored floor elevation")
	await _walk(150)
	_check(player.position.z > 6.25 and player.position.z < 6.4, "Closed swing door must block actual CharacterBody movement")
	# Open from outside the leaf sweep, as a real player would. The animatable
	# body may correctly push a player standing against its closed face.
	await _place(Vector3(3,0.4,7.5))
	player.interact()
	await _frames(40)
	await _walk(140)
	_check(player.position.z < 5.2, "Ray interaction must open swing door and allow passage")
	await _walk(100)
	_check(player.position.z > 4.25 and player.position.z < 4.4, "Closed slide door must block movement")
	player.interact()
	await _frames(40)
	await _walk(75)
	_check(player.position.z < 3.2, "Sliding door must permit passage after interaction")

	await _place(Vector3(5,0.4,4))
	await _walk(150)
	_check(player.position.z > 2.75 and player.position.z < 2.9, "Furniture collider must block independently of model geometry")
	await _place(Vector3(7,0.4,8.5))
	await _walk(120)
	_check(player.position.z > 7.5 and player.position.z < 7.65, "Round column collision alignment")
	await _place(Vector3(2,0.4,1.5))
	await _walk(150)
	_check(player.position.z > 0.35 and player.position.z < 0.5, "Architecture wall collision alignment")

	await _place(Vector3(9,0.4,9.6))
	await _walk(480)
	_check(player.position.z < 2.7, "Player must reach upper landing through the authored aperture")
	_check(player.is_on_floor() and absf(player.position.y - 3.4) < 0.03, "Straight ramp must reach the explicit adjacent-floor elevation")
	player.rotation.y = PI
	await _walk(480)
	_check(player.position.z > 9.4, "Player must descend the same straight stairs")
	_check(player.is_on_floor() and absf(player.position.y - 0.4) < 0.03, "Descending player must return to lower floor")
	_key(false)
	world.free()
	print("Runtime walkthrough integration: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
