extends SceneTree
const MAIN := preload("res://main.tscn")
var main
var failures := 0
func _initialize(): _run.call_deferred()
func _check(value: bool, text: String):
	if not value: failures += 1; push_error(text)
func _frames(count: int):
	for i in range(count): await physics_frame
func _idle():
	var deadline := Time.get_ticks_msec() + 30000
	while Time.get_ticks_msec() < deadline:
		await process_frame; OS.delay_msec(2)
		if not main._session.busy and not main._editing and main._layout_camera != null and not main._layout_camera.transitioning:
			await _frames(3); return
	_check(false,"Control operation deadline")
func _command(value: Dictionary): main._edit_layout(value); await _idle()
func _key(code: Key):
	var event := InputEventKey.new(); event.keycode=code;event.physical_keycode=code;event.pressed=true
	root.push_input(event,true)
	event.pressed=false;root.push_input(event,true)
func _project(): return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
func _capture(directory: String, name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"Native product screenshot must save")
func _run():
	var args := OS.get_cmdline_user_args()
	if args.size() != 3: push_error("Expected native Project, output directory and mismatched GLB"); quit(2); return
	main=MAIN.instantiate();root.add_child(main);await process_frame
	main._open_project(args[0]);await _idle()
	DirAccess.make_dir_recursive_absolute(args[1])
	await _capture(args[1],"top-view")
	var world=main._world
	var world_id=world.get_instance_id()
	var camera=main._layout_camera
	var player: P2WPlayer=world.get_node("Player")
	_check(main._spawn.is_equal_approx(Vector3(3,.4,.5)),"The compiler's authored entrance must be the default start")
	_check(player.get_node("Camera3D").global_basis.z.is_equal_approx(Vector3(0,0,-1)),"The initial camera must face inward from the entrance")
	_check(not main._session.has_method("undo") and not main._session.has_method("redo"),"Game-like furniture editing must have no undo/redo API")
	# A failed semantic import must preserve the active world AND editable source.
	var source=main._session.current()["projectPath"]
	var malformed: Dictionary=main._runtime_data.duplicate(true)
	malformed["entities"].filter(func(e):return e["kind"]=="furniture")[0].erase("size")
	DirAccess.make_dir_recursive_absolute(args[1])
	var invalid=str(args[1]).path_join("invalid.runtime.json")
	var file=FileAccess.open(invalid,FileAccess.WRITE);file.store_string(JSON.stringify(malformed));file.close()
	_check(not main._open_scene(invalid),"Malformed semantic input must be rejected before staging/replacement")
	_check(main._world.get_instance_id()==world_id and main._session.current()["projectPath"]==source and FileAccess.file_exists(source),"Failed load must preserve world, source and unsaved-state ownership")
	_check(not main._open_scene(main._session.current()["runtimePath"],str(args[2])),"Mismatched static architecture must not replace a world")
	_check(main._world.get_instance_id()==world_id,"Wrong GLB pairing must preserve the previous world")
	main._resume();await _idle()
	# Collider bounds/floor apertures and the protected entrance remain authoritative.
	for position in [{"x":3000,"y":3000},{"x":300,"y":50}]:
		await _command({"type":"move","floorId":"ground","id":"sofa","position":position})
		_check(main._session.current()["projectPath"]==source,"Invalid placement must never commit or create historical state")
	await _command({"type":"add","floorId":"upper","position":{"x":900,"y":600},"asset":{"catalogId":"chair"}})
	_check(main._session.current()["projectPath"]==source,"Furniture must not be placed without floor support over an authored hole")
	# Drag interrupted by framing must end before the tween consumes release.
	var press:=InputEventMouseButton.new();press.button_index=MOUSE_BUTTON_LEFT;press.pressed=true
	press.position=camera.camera.unproject_position(Vector3(5,.9,2));root.push_input(press,true)
	_check(camera._moving,"Furniture must be selected with the native pointer pipeline")
	camera.fit_floor();press.pressed=false;root.push_input(press,true);await _idle()
	_check(not camera._moving,"Reframing must cancel held placement before mouse release can be lost")
	# FPS: mouse moves look only. Arrow keys nudge 1cm; the player never moves.
	main._show_walkthrough();await _idle()
	player.position=Vector3(5,.4,3.8);player.rotation=Vector3.ZERO;player._pitch=-.55;player.get_node("Camera3D").rotation.x=player._pitch;await _frames(3)
	_key(KEY_F)
	_check(main._adjustment.active and not player.is_physics_processing(),"F must enter furniture adjustment and suspend locomotion")
	var feet:=player.position
	var origin: Vector3=camera._origin
	var mouse:=InputEventMouseMotion.new();mouse.relative=Vector2(100,0);mouse.position=Vector2(600,350);root.push_input(mouse,true)
	_check(camera._preview.is_equal_approx(origin),"Mouse look must never drag furniture in first person")
	# Restore view heading for an independent exact 1cm right step.
	player.rotation=Vector3.ZERO
	_key(KEY_RIGHT)
	_check(camera._preview.is_equal_approx(origin+Vector3(.01,0,0)) and player.position.is_equal_approx(feet),"A keyboard tap must move furniture only 1cm in the floor plane")
	await _capture(args[1],"floor-micro-adjustment")
	_key(KEY_F);await _idle()
	var saved_item: Dictionary=_project()["floors"][0]["furniture"].filter(func(e):return e["id"]=="sofa")[0]
	_check(is_equal_approx(saved_item["position"]["x"],501),"Accepted nudge must persist native centimetres")
	# Gamepad deadzone and progressive movement use actual JoypadMotion input.
	player.rotation=Vector3.ZERO
	_key(KEY_F)
	var before: Vector3=camera._preview
	var stick:=InputEventJoypadMotion.new();stick.axis=JOY_AXIS_LEFT_X;stick.axis_value=.1;Input.parse_input_event(stick);await _frames(15)
	_check(camera._preview.is_equal_approx(before),"Gamepad deadzone must suppress small stick noise")
	stick.axis_value=.7;Input.parse_input_event(stick);await _frames(15)
	_check(camera._preview.x>before.x and camera._preview.x-before.x<.03 and is_equal_approx(camera._preview.y,before.y),"Gamepad micro-adjustment must be gradual and floor constrained")
	stick.axis_value=0;Input.parse_input_event(stick)
	_key(KEY_ESCAPE)
	_check(not main._adjustment.active and camera._preview.y==before.y,"Cancel must discard an uncommitted preview without undo history")
	# Wall picture: explicit host frame, not inferred from mesh or nearest wall.
	_key(KEY_F2);await _idle()
	var plan=main._plan_view
	for i in range(plan._catalog.size()):
		if plan._catalog[i]["asset"].get("catalogId")=="wall_art": plan._palette.select(i);plan._palette.item_selected.emit(i)
	_check(plan._wall_selector.visible and plan._mount_height.visible,"Wall catalog selection must expose native attachment controls")
	plan._wall_selector.select(plan._wall_ids.find("ground-w0"));plan._mount_side.select(0);plan._mount_height.value=140
	camera._center=Vector2(6,6)
	plan.find_child("AddFurniture",true,false).pressed.emit();await _idle()
	var wall_id: String=main._session.current()["selectedId"]
	var bound: Dictionary=camera._entities[wall_id]
	_check(bound["movement"]["kind"]=="wall","Compiler must emit wall movement constraints")
	await _capture(args[1],"wall-layout-controls")
	main._show_walkthrough();await _idle()
	player.position=Vector3(6,.4,1.6);player.rotation=Vector3.ZERO;player._pitch=0;player.get_node("Camera3D").rotation.x=0;await _frames(3)
	_key(KEY_F)
	_check(main._adjustment.active and camera.selected_id==wall_id,"FPS ray selection must target the actual mounted item")
	var wall_pose: Vector3=camera._preview
	_key(KEY_UP);_key(KEY_RIGHT)
	_check(camera._preview.is_equal_approx(wall_pose+Vector3(.01,.01,0)),"Wall adjustment may move along the host and vertically, never away from the wall")
	await _capture(args[1],"wall-micro-adjustment")
	_key(KEY_F);await _idle()
	var wall_item: Dictionary=_project()["floors"][0]["furniture"].filter(func(e):return e["id"]==wall_id)[0]
	_check(is_equal_approx(wall_item["wallMount"]["elevation"],141) and is_equal_approx(wall_item["position"]["y"],12.6),"Wall constraints and installation height must persist in the native Project")
	# Closing a door must stop before furniture, including after a layout commit.
	_key(KEY_F2);await _idle()
	var door=world.get_node("Door_swing-door")
	door.interact();await _frames(40)
	_check(door._opened,"Unobstructed door must open")
	await _command({"type":"add","floorId":"ground","position":{"x":300,"y":600},"asset":{"catalogId":"chair"}})
	var blocker: String=main._session.current()["selectedId"]
	_check(not blocker.is_empty(),"Open doorway must accept a furniture blocker for the motion regression")
	door.interact();await _frames(40)
	_check(not door._busy and door._opened and camera.placement_allowed(main._runtime_data,blocker),"A closing door must stop without intersecting furniture")
	# Atomic saves replace the requested file; a failed save preserves dirty state.
	var saved=str(args[1]).path_join("current.project.json")
	_check(main._session.save_project(saved)==OK,"Native save must succeed")
	await _command({"type":"remove","floorId":"ground","id":blocker})
	_check(main._session.save_project(str(args[1]).path_join("missing/current.json"))!=OK and main._session.is_dirty(),"Failed save must not clear unsaved changes")
	_check(main._session.save_project(saved)==OK and FileAccess.get_sha256(saved)==FileAccess.get_sha256(main._session.current()["projectPath"]),"Atomic save must replace an existing Project with the current coordinates")
	# FPS selection covers upper-floor non-walking markers even if the last
	# top-view floor was ground. Top-view picking still isolates its floor.
	await _command({"type":"add","floorId":"upper","position":{"x":600,"y":250},"asset":{"catalogId":"rug"}})
	var upper_item: String=str(main._session.current()["selectedId"])
	camera.select_floor("ground");await _idle()
	main._show_walkthrough();await _idle()
	player.position=Vector3(6,3.4,3.2);player.rotation=Vector3.ZERO;player._pitch=-1.15;player.get_node("Camera3D").rotation.x=player._pitch;await _frames(3)
	_key(KEY_F)
	_check(main._adjustment.active and camera.selected_id==upper_item and camera.floor_id=="upper","First-person selection must reach flat items on the player's actual floor")
	_check(plan._wall_ids.has("upper-w0") and not plan._wall_ids.has("ground-w0"),"Changing selected floors must refresh native wall attachment choices")
	_key(KEY_ESCAPE)
	# No retained versions after edits; original source remains untouched.
	_check(DirAccess.open(main._session._directory).get_directories().size()==1,"Only the current accepted state may remain in the session")
	main.free();paused=false
	print("Runtime product controls: ","PASS" if failures==0 else "FAIL (%d)"%failures)
	quit(0 if failures==0 else 1)
