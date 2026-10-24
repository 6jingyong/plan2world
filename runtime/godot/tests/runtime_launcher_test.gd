extends SceneTree

const MAIN := preload("res://main.tscn")
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _frames(count: int) -> void:
	for i in range(count):
		await physics_frame

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		quit(2)
		return
	if "--require-packed" in args:
		_check(FileAccess.file_exists("res://project.binary") and not FileAccess.file_exists("res://project.godot"), "Delivery gate must load the exported PCK, not the authoring checkout")
	var main := MAIN.instantiate()
	root.add_child(main)
	await process_frame
	_check(paused and main.get_node_or_null("RuntimeScene") == null, "No-argument launch must show the picker without loading a demo")
	var menu := main.get_node("SceneMenu")
	var picker := menu.get_node("ScenePicker")
	picker.file_selected.emit(str(args[0]))
	await _frames(30)
	var world := main.get_node("RuntimeScene")
	var world_id := world.get_instance_id()
	var player := world.get_node("Player") as CharacterBody3D
	_check(not paused and player.is_on_floor(), "Picker must load a scene and ground its player")
	_check(world.get_node_or_null("Architecture") != null, "Relocated runtime must load its sibling architecture GLB")
	var pose := player.position
	var menu_key := InputEventKey.new()
	menu_key.keycode = KEY_F1
	menu_key.pressed = true
	root.push_input(menu_key)
	await process_frame
	_check(paused, "F1 must pause the walkthrough for scene selection")
	Input.action_press("move_forward")
	await _frames(30)
	Input.action_release("move_forward")
	_check(player.position.is_equal_approx(pose), "Movement must stop while the scene menu is open")
	# A native Project file is deliberately rejected instead of being interpreted
	# by the engine. A failed open must leave the previous scene resumable.
	var invalid_path := "user://not-a-runtime.json"
	var file := FileAccess.open(invalid_path, FileAccess.WRITE)
	file.store_string('{"schema":"native-project","floors":[]}')
	file.close()
	picker.file_selected.emit(invalid_path)
	_check(paused and main.get_node("RuntimeScene") == world, "Failed open must preserve the running scene")
	menu.resume_requested.emit()
	await _frames(2)
	_check(not paused and player.position.is_equal_approx(pose), "Resume must restore the same walkthrough")
	picker.file_selected.emit(str(args[0]))
	await _frames(30)
	_check(main.get_node("RuntimeScene").get_instance_id() != world_id and not is_instance_valid(world), "Opening another scene must free the previous world")
	_check(main.get_node("RuntimeScene/Player").is_on_floor(), "Replacement scene must have one grounded player")
	main.free()
	paused = false
	print("Runtime launcher integration: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
