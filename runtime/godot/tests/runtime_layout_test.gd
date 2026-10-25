extends SceneTree

const MAIN := preload("res://main.tscn")
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)

func _idle(main) -> void:
	var deadline := Time.get_ticks_msec() + 30000
	while Time.get_ticks_msec() < deadline:
		await process_frame
		OS.delay_msec(5)
		if not main._session.busy and main._layout_camera != null and not main._layout_camera.transitioning:
			for i in range(3): await physics_frame
			return
	_check(false, "Editing core and native camera must finish within the wall-clock deadline")

func _project(main) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))

func _item(project: Dictionary, id: String) -> Dictionary:
	for item in project["floors"][0]["furniture"]:
		if item["id"] == id:
			return item
	return {}

func _capture(directory: String, name: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join(name + ".png")) == OK, "Native view capture must save")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 2:
		quit(2)
		return
	var source_hash := FileAccess.get_sha256(args[0])
	DirAccess.make_dir_recursive_absolute(args[1])
	var main := MAIN.instantiate()
	root.add_child(main)
	await process_frame
	main.get_node("SceneMenu/ProjectPicker").file_selected.emit(args[0])
	await _idle(main)
	if main.get_node_or_null("RuntimeScene") == null:
		_check(false, "Editable Project must compile and open without a browser")
		main.free(); paused = false; quit(1); return
	var world := main.get_node("RuntimeScene")
	var world_id := world.get_instance_id()
	var architecture_id := world.get_node("Architecture").get_instance_id()
	var player := world.get_node("Player") as P2WPlayer
	var pose := player.position
	var plan := world.get_node("PlanView")
	_check(not paused and not player.is_physics_processing() and plan.visible and plan.controller.editing, "Editable Project must open directly in furniture layout mode")
	print("Layout framing: camera=", plan.controller.camera.global_transform, " height=", plan.controller._height, " inset=", plan.controller.inset_top, " current=", plan.controller.camera.current)
	var view_size: Vector2 = plan.controller.get_viewport().get_visible_rect().size
	for point in [Vector3(0, 3.4, 0), Vector3(12, 3.4, 12)]:
		var screen: Vector2 = plan.controller.camera.unproject_position(point)
		_check(screen.x >= 0 and screen.x <= view_size.x and screen.y >= plan.get_node("Toolbar").size.y and screen.y <= view_size.y, "Fit floor must frame wall tops below the toolbar")
	await _capture(args[1], "top-view")
	var before := _project(main)
	var furniture_count: int = before["floors"][0]["furniture"].size()
	var catalog: Array = main._session.current()["catalog"]
	var palette := plan.find_child("FurnitureCatalog", true, false) as OptionButton
	for i in range(catalog.size()):
		if catalog[i]["asset"].get("catalogId") == "sofa": palette.select(i)
	plan.find_child("AddFurniture", true, false).pressed.emit()
	await _idle(main)
	var added_id := str(main._session.current()["selectedId"])
	_check(_project(main)["floors"][0]["furniture"].size() == furniture_count + 1, "Add must update the native Project")
	_check(world.get_node("FurnitureLayout").find_child("Asset_" + added_id, true, false) != null, "Added catalog model must load as an asset")
	plan.find_child("RotateFurniture", true, false).pressed.emit()
	await _idle(main)
	_check(is_equal_approx(float(_item(_project(main), added_id)["rotation"]), 90), "Rotate must persist native clockwise degrees")
	var entity: Dictionary
	for candidate in plan.controller.data["entities"]:
		if candidate["id"] == added_id: entity = candidate
	var start := Vector2(entity["position"][0], entity["position"][2])
	var target := start + Vector2(0.5, -0.5)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = plan.controller.camera.unproject_position(Vector3(start.x, entity["position"][1], start.y))
	root.push_input(press, true)
	var drag := InputEventMouseMotion.new()
	# Independent expected world delta: ray intersections with the authored floor.
	var floor_plane := Plane(Vector3.UP, 0.4)
	var grabbed: Vector3 = floor_plane.intersects_ray(plan.controller.camera.project_ray_origin(press.position), plan.controller.camera.project_ray_normal(press.position))
	var destination := Vector3(target.x + grabbed.x - start.x, 0.4, target.y + grabbed.z - start.y)
	drag.position = plan.controller.camera.unproject_position(destination)
	root.push_input(drag, true)
	_check(plan.controller.selected_id == added_id and plan.controller._moving, "Native physics ray picking must select the visible furniture")
	var preview_model: Node3D = main._furniture_models[added_id]
	_check(not preview_model.global_transform.is_equal_approx(plan.controller._model_pose) and _item(_project(main), added_id)["position"] == { "x": start.x * 100, "y": start.y * 100 }, "Drag must preview the real model without prematurely changing the Project")
	await _capture(args[1], "furniture-drag")
	var original_pose: Transform3D = plan.controller._model_pose
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	root.push_input(escape)
	_check(not plan.controller._moving and preview_model.global_transform.is_equal_approx(original_pose) and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE, "Top-view Escape must cancel the preview without capturing the mouse")
	root.push_input(press, true)
	root.push_input(drag, true)
	press.pressed = false
	press.position = drag.position
	root.push_input(press, true)
	await _idle(main)
	var moved := _item(_project(main), added_id)
	_check(is_equal_approx(float(moved["position"]["x"]), target.x * 100) and is_equal_approx(float(moved["position"]["y"]), target.y * 100), "Dragging must save native centimetres through the shared core")
	for i in range(catalog.size()):
		if catalog[i]["asset"].get("catalogId") == "chair": palette.select(i)
	plan.find_child("ReplaceFurniture", true, false).pressed.emit()
	await _idle(main)
	_check(_item(_project(main), added_id)["catalogId"] == "chair", "Replace must retain identity and use the selected catalog item")
	var collider := main._collider_nodes["furniture:" + added_id] as StaticBody3D
	_check(collider.position.is_equal_approx(Vector3(target.x, 0.85, target.y)), "Furniture collision must use compiler output after replacement")
	_check(plan.find_child("UndoLayout", true, false) == null and not main._session.has_method("undo"), "The product must not expose undo or store an operation history")
	for i in range(catalog.size()):
		if catalog[i]["asset"].get("customModelId") == "box": palette.select(i)
	plan.find_child("ReplaceFurniture", true, false).pressed.emit()
	await _idle(main)
	_check(_item(_project(main), added_id).get("customModelId") == "box" and world.get_node("FurnitureLayout").find_child("Asset_" + added_id, true, false) != null, "Custom replacement must load the retained Project GLB through the shared core")
	for i in range(catalog.size()):
		if catalog[i]["asset"].get("catalogId") == "chair": palette.select(i)
	plan.find_child("ReplaceFurniture", true, false).pressed.emit()
	await _idle(main)
	plan.find_child("DeleteFurniture", true, false).pressed.emit()
	await _idle(main)
	_check(_item(_project(main), added_id).is_empty() and not main._collider_nodes.has("furniture:" + added_id), "Delete must remove native furniture and its collider")
	main._edit_layout({ "type": "add", "floorId": plan.controller.floor_id, "position": { "x": target.x * 100, "y": target.y * 100 }, "asset": { "catalogId": "chair" } })
	await _idle(main)
	added_id = str(main._session.current()["selectedId"])
	var saved := str(args[1]).path_join("saved.project.json")
	plan.save_requested.emit(saved)
	_check(FileAccess.file_exists(saved) and not main._session.is_dirty(), "Save must create a reusable native Project and clear dirty state")
	var zip := str(args[1]).path_join("scene.runtime.zip")
	plan.export_requested.emit(zip)
	_check(FileAccess.file_exists(zip), "Export must copy the shared runtime package")
	var after := _project(main)
	for i in range(before["floors"].size()):
		for key in ["walls", "rooms", "doors", "windows", "stairs", "columns"]:
			_check(JSON.stringify(before["floors"][i][key]) == JSON.stringify(after["floors"][i][key]), "Furniture editing must preserve native architecture: " + key)
	_check(world.get_instance_id() == world_id and world.get_node("Architecture").get_instance_id() == architecture_id and player.position.is_equal_approx(pose), "Furniture edits must preserve world, architecture and player nodes/pose")
	# Physics rejects compiler commands intersecting a wall or another furniture.
	var revision: String = main._session.current()["projectPath"]
	var state_hash := FileAccess.get_sha256(revision)
	for blocked in [{ "x": 5, "y": 500 }, { "x": 500, "y": 200 }]:
		main._edit_layout({ "type": "move", "floorId": plan.controller.floor_id, "id": added_id, "position": blocked })
		await _idle(main)
		_check(main._session.current()["projectPath"] == revision and FileAccess.get_sha256(revision) == state_hash, "Native physics must reject overlaps without changing the Project state")
	main._edit_layout({ "type": "add", "floorId": plan.controller.floor_id, "position": { "x": 10, "y": 10 }, "asset": { "catalogId": "not-a-model" } })
	await _idle(main)
	_check(main._session.current()["projectPath"] == revision and world.get_instance_id() == world_id, "Invalid edits must retain the last valid Project and runtime")
	_check(FileAccess.get_sha256(args[0]) == source_hash, "Opening and editing must never overwrite the original input")
	# Dirty navigation must be explicitly discardable; cancelling retains editor.
	main._edit_layout({ "type": "rotate", "floorId": plan.controller.floor_id, "id": added_id, "rotation": 180 })
	await _idle(main)
	revision = main._session.current()["projectPath"]
	main.get_node("SceneMenu/ProjectPicker").file_selected.emit(saved)
	_check(main._discard.visible and paused, "Switching Project with unsaved edits must ask before discarding")
	main._discard.hide()
	main._discard.canceled.emit()
	main._resume()
	_check(main._session.current()["projectPath"] == revision and main._session.is_dirty(), "Cancel discard must preserve the active layout")
	# Reopen the saved Project through the same public picker entry point.
	main.get_node("SceneMenu/ProjectPicker").file_selected.emit(saved)
	main._discard.hide()
	main._discard.confirmed.emit()
	await _idle(main)
	_check(_item(_project(main), added_id)["catalogId"] == "chair", "Saved Project must reopen with the edited layout")
	main._show_walkthrough()
	for i in range(12): await physics_frame
	await _capture(args[1], "camera-transition")
	await _idle(main)
	await _capture(args[1], "first-person")
	_check(DirAccess.open(main._session._directory).get_directories().size() == 1, "Only the accepted current state may remain on disk; superseded candidates must be deleted")
	var session_directory: String = main._session._directory
	main.free(); paused = false
	_check(not DirAccess.dir_exists_absolute(session_directory) and FileAccess.file_exists(saved) and FileAccess.get_sha256(args[0]) == source_hash, "Closing must clean private revisions while retaining saved/source Projects")
	print("Runtime furniture layout integration: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
