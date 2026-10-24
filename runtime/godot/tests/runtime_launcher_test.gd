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
	world = main.get_node("RuntimeScene")
	player = world.get_node("Player") as CharacterBody3D
	pose = player.position
	# Alt-tab while walking must pause and clear the held movement. Focus return
	# alone must not recapture the pointer or resume a player the user cannot see.
	Input.action_press("move_forward")
	main.notification(Node.NOTIFICATION_WM_WINDOW_FOCUS_OUT)
	_check(paused, "Losing desktop focus must pause the walkthrough")
	_check(not Input.is_action_pressed("move_forward"), "Focus pause must release held movement")
	await _frames(30)
	_check(player.position.is_equal_approx(pose), "Unfocused player must not move or fall")
	main.notification(Node.NOTIFICATION_WM_WINDOW_FOCUS_IN)
	_check(paused, "Focus return must wait for explicit resume")
	menu.resume_requested.emit()
	await _frames(8)
	_check(player.position.is_equal_approx(pose), "Resume must not replay a held key from before focus loss")
	Input.action_release("move_forward")
	# Manual recovery uses the exact compiled spawn. It must retain the current
	# world and door state, rather than rebuilding or inventing a floor below it.
	var return_button := menu.find_child("ReturnToStart", true, false)
	_check(return_button != null, "The menu must provide Return to start")
	if return_button != null:
		var door := world.get_node("Door_swing-door")
		door.interact()
		await _frames(40)
		var world_before_return := world.get_instance_id()
		var look := InputEventMouseMotion.new()
		look.relative = Vector2(100, -100)
		root.push_input(look)
		player.position = Vector3(3, -8, 8)
		player.velocity = Vector3(0, -12, 0)
		player.rotation.y = 1.3
		main.notification(Node.NOTIFICATION_WM_WINDOW_FOCUS_OUT)
		return_button.pressed.emit()
		_check(player.velocity == Vector3.ZERO and player.rotation.is_zero_approx(), "Return to start must reset falling velocity and heading")
		_check(player.get_node("Camera3D").rotation.is_zero_approx(), "Return to start must reset the view pitch")
		look.relative = Vector2.ZERO
		root.push_input(look)
		_check(player.get_node("Camera3D").rotation.is_zero_approx(), "The next mouse event must not restore pre-return look state")
		await _frames(30)
		_check(not paused and player.is_on_floor() and player.position.is_equal_approx(pose), "Return to start must ground at the compiled spawn")
		_check(world.get_instance_id() == world_before_return and door._opened, "Returning the player must retain the current world and open doors")
	main.free()
	paused = false
	print("Runtime launcher integration: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
