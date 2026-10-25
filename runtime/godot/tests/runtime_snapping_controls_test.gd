extends SceneTree

const MAIN := preload("res://main.tscn")
var main
var failures := 0
var directory := ""
func _initialize(): _run.call_deferred()

func _check(value: bool, text: String):
	if not value: failures += 1; push_error(text)
func _idle():
	var deadline := Time.get_ticks_msec() + 30000
	while Time.get_ticks_msec() < deadline:
		await process_frame; OS.delay_msec(2)
		if not main._session.busy and not main._editing and main._layout_camera != null and not main._layout_camera.transitioning:
			for i in range(3): await physics_frame
			return
	_check(false,"Snapping control deadline")
func _capture(name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"Native snapping UI screenshot must save")
func _key(code: Key, pressed: bool):
	var event := InputEventKey.new(); event.keycode=code;event.physical_keycode=code;event.pressed=pressed
	root.push_input(event,true)
func _pick(id: String):
	var camera=main._layout_camera
	var event:=InputEventMouseButton.new(); event.button_index=MOUSE_BUTTON_LEFT;event.pressed=true
	event.position=camera.camera.unproject_position(camera._vec3(camera._entities[id]["position"]))
	root.push_input(event,true)
	_check(camera._moving and camera.selected_id==id,"Actual native pointer must begin the furniture gesture")
func _drag(point: Vector3, bypass:=false):
	var camera=main._layout_camera
	var event:=InputEventMouseMotion.new();event.alt_pressed=bypass
	event.position=camera.camera.unproject_position(point+camera._grab_offset)
	root.push_input(event,true)
func _drop():
	var camera=main._layout_camera
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.pressed=false
	event.position=camera.camera.unproject_position(camera._drag_point+camera._grab_offset)
	root.push_input(event,true)
	await _idle()
func _project(): return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
func _item(): return _project()["floors"][0]["furniture"].filter(func(e):return e["id"]=="sofa")[0]
func _run():
	# Dummy headless windows expose a 64px viewport. Give UI gates a real
	# desktop canvas; rendered tests retain native pixels and actual resizing.
	if DisplayServer.get_name() == "headless":
		root.content_scale_size = Vector2i(1280, 720)
		root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var args:=OS.get_cmdline_user_args()
	if args.size()!=2: push_error("Expected native Project and output directory");quit(2);return
	directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	var input_hash:=FileAccess.get_sha256(args[0])
	main=MAIN.instantiate();root.add_child(main);await process_frame
	await _capture("welcome")
	main._open_project(args[0]);await _idle()
	var camera=main._layout_camera
	var plan=main._plan_view
	var architecture_hash:=FileAccess.get_sha256(main._session.current()["runtimePath"].get_basename()+".architecture.glb")
	_check(plan._snap.button_pressed and plan._grid.button_pressed and camera.snapping.enabled,"Top-view magnetic placement and grid start enabled")
	await _capture("arrange")
	_pick("sofa");_drag(Vector3(6.27,.9,3.17))
	_check(camera._preview.is_equal_approx(Vector3(6.3,.9,3.2)),"Actual pointer drag must capture the 10 cm grid using semantic floor height")
	await _drop()
	_check(is_equal_approx(_item().position.x,630) and is_equal_approx(_item().position.y,320),"Grid placement persists native centimetres")
	main._edit_layout({"type":"rotate","floorId":"ground","id":"sofa","rotation":90});await _idle()
	var accepted: String=main._session.current()["projectPath"]
	_pick("sofa");_drag(Vector3(7.43,.9,.64))
	_check(camera._preview.is_equal_approx(Vector3(7.4,.9,.6)) and is_zero_approx(camera._preview_yaw) and camera._preview_allowed(),"Wall capture must preview a physical flush pose and front-away orientation")
	_check(main._session.current()["projectPath"]==accepted and _item().rotation==90,"Magnetic preview must not commit a partial position or rotation")
	_check(plan._snap_status.text=="Wall aligned" and camera._guides.visible,"Capture must provide visible text and spatial feedback")
	await _capture("wall-capture")
	_drag(Vector3(7.43,.9,.70))
	_check(is_equal_approx(camera._preview.z,.6),"Pointer capture must hold until the release tolerance")
	_drag(Vector3(7.43,.9,.74))
	_check(not is_zero_approx(camera._preview_yaw) and not camera._guides.visible,"Pointer must release the wall and restore original orientation outside tolerance")
	_drag(Vector3(7.43,.9,.64),true)
	_check(camera._preview.is_equal_approx(Vector3(7.43,.9,.64)) and is_equal_approx(camera._preview_yaw,PI/2),"Alt must allow exact free placement with original facing")
	_key(KEY_ALT,false)
	_check(camera._preview.is_equal_approx(Vector3(7.4,.9,.6)) and is_zero_approx(camera._preview_yaw),"Releasing Alt must reacquire the preview at the same pointer")
	await _drop()
	_check(is_equal_approx(_item().position.x,740) and is_equal_approx(_item().position.y,60) and is_zero_approx(_item().rotation) and not _item().has("wallMount"),"One accepted command must save wall-aligned position/rotation without inventing wall attachment")
	var collider=main._collider_nodes["furniture:sofa"]
	_check(collider.position.is_equal_approx(Vector3(7.4,.9,.6)) and is_zero_approx(collider.rotation.y),"Collision follows the same committed compiler pose as the model")
	# Native controls change the same live solver; no hidden alternate drag path.
	plan._grid.button_pressed=false
	_pick("sofa");_drag(Vector3(7.03,.9,3.8))
	_check(is_equal_approx(camera._preview.x,7) and is_equal_approx(camera._preview.z,3.8) and plan._snap_status.text=="Furniture aligned","Nearby furniture centres align while grid snapping is independently off")
	await _capture("furniture-alignment")
	_key(KEY_ESCAPE,true);_key(KEY_ESCAPE,false)
	_check(not camera._moving and collider.position.is_equal_approx(Vector3(7.4,.9,.6)),"Cancelling an alignment must restore accepted pose/collision")
	plan._snap.button_pressed=false
	_pick("sofa");_drag(Vector3(6.27,.9,3.17))
	_check(camera._preview.is_equal_approx(Vector3(6.27,.9,3.17)),"The visible magnet switch must disable all automatic pose changes")
	_key(KEY_ESCAPE,true);_key(KEY_ESCAPE,false)
	plan._snap.button_pressed=true;plan._grid.button_pressed=true
	# A doorway is neither a magnetic wall surface nor an allowed placement.
	var safe_revision: String=main._session.current()["projectPath"]
	_pick("sofa");_drag(Vector3(3,.9,.6))
	_check(not camera._preview_allowed() and plan._snap_status.text!="Wall aligned","Wall snapping cannot hide closed-door/entrance obstacles")
	await _drop()
	_check(main._session.current()["projectPath"]==safe_revision and is_equal_approx(_item().position.x,740) and is_equal_approx(_item().position.y,60) and is_zero_approx(_item().rotation),"Blocked drop must keep the last accepted coordinates")
	# Reframing accounts for all native panels, even at the supported minimum.
	var original_size:=root.size
	root.size=Vector2i(800,540)
	if DisplayServer.get_name()=="headless": root.content_scale_size=Vector2i(800,540)
	await _idle()
	await _capture("compact-arrange")
	for name in ["FirstPerson","FloorSelector","FitFloor","MagneticSnap","GridSnap","SaveProject","ExportScene"]:
		var button: Control=plan.find_child(name,true,false)
		var rect:=button.get_global_rect()
		_check(Rect2(Vector2.ZERO,root.get_visible_rect().size).encloses(rect),"Compact UI must retain the visible control: "+name)
	for point in [Vector3(0,3.4,0),Vector3(12,3.4,12)]:
		var screen: Vector2=camera.camera.unproject_position(point)
		_check(screen.x>=camera.inset_left and screen.x<=root.get_visible_rect().size.x and screen.y>=camera.inset_top and screen.y<=root.get_visible_rect().size.y-camera.inset_bottom,"Fit view must keep architecture out of the furnishing panel and context bar")
	main._show_menu();await process_frame
	await _capture("compact-menu")
	_check(main._launcher._screen.get_global_rect().encloses(main._launcher.find_child("OpenProject",true,false).get_global_rect()),"Compact scene menu primary action must fit the viewport")
	root.size=original_size
	if DisplayServer.get_name()=="headless": root.content_scale_size=Vector2i(1280,720)
	main._resume();await _idle()
	var saved:=directory.path_join("snapped.project.json")
	_check(main._session.save_project(saved)==OK,"Snapped layout must save")
	main._open_project(saved);await _idle()
	_check(is_equal_approx(_item().position.x,740) and is_equal_approx(_item().position.y,60) and is_zero_approx(_item().rotation),"Snapped pose must survive close/reopen through the native compiler")
	_check(FileAccess.get_sha256(main._session.current()["runtimePath"].get_basename()+".architecture.glb")==architecture_hash and FileAccess.get_sha256(args[0])==input_hash,"Snapping must preserve original input and byte-identical architectural presentation")
	main._show_walkthrough();await _idle();await _capture("explore")
	main.free();paused=false
	print("Runtime snapping and native UI controls: ","PASS" if failures==0 else "FAIL (%d)"%failures)
	quit(0 if failures==0 else 1)
