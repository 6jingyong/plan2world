extends SceneTree

var main
var directory:=""
var failures:Array=[]
var paint_checks:Array=[]
func _initialize():run.call_deferred()
func check(ok:bool,message:String):
	if not ok:failures.append(message);push_error(message)
func idle():
	var deadline:=Time.get_ticks_msec()+60000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if not main._session.busy and not main._editing and main._layout_camera!=null and not main._layout_camera.transitioning:
			for i in range(5):await process_frame
			if not main._session.busy and not main._layout_camera.transitioning:return
	check(false,"Scene switching must settle within the native task deadline")
func click(control:Control):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=control.get_global_rect().get_center();event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func key(code:Key):
	var event:=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func paint(name:String):
	var button:Control=main._plan_view.find_child("FirstPerson",true,false)
	check(button.is_visible_in_tree() and not button.disabled,"settled scene retains its enabled plan navigation")
	if DisplayServer.get_name()=="headless":
		paint_checks.append({"name":name,"status":"not_run","reason":"Headless display; control/input assertions run separately."});return
	for i in range(3):await process_frame
	await RenderingServer.frame_post_draw
	var file:=directory.path_join(name+".png")
	check(root.get_texture().get_image().save_png(file)==OK,"save the actual scene-switch frame")
	# Read the SAVED pixels as well as widget state. A visible property alone
	# cannot establish that a toolbar was actually drawn.
	var picture:=Image.load_from_file(file);var rect:=button.get_global_rect().grow(-6)
	var painted:=0;var total:=0
	for y in range(int(rect.position.y),int(rect.end.y),3):
		for x in range(int(rect.position.x),int(rect.end.x),3):
			var pixel:=picture.get_pixel(x,y)
			if Vector3(pixel.r-.223529,pixel.g-.482353,pixel.b-.403922).length()<.08:painted+=1
			total+=1
	var fraction:=float(painted)/maxi(1,total)
	check(fraction>.4,"saved frame must contain the actual Walk button: "+name)
	var rail:Control=main._plan_view.find_child("OpenCatalog",true,false)
	var rail_rect:=rail.get_global_rect().grow(-6);var rail_painted:=0;var rail_total:=0
	for y in range(int(rail_rect.position.y),int(rail_rect.end.y),3):
		for x in range(int(rail_rect.position.x),int(rail_rect.end.x),3):
			var pixel:=picture.get_pixel(x,y)
			for color in [Color("e2eee2"),Color("d2e5d5"),Color("bcd8c5")]:
				if Vector3(pixel.r-color.r,pixel.g-color.g,pixel.b-color.b).length()<.03:rail_painted+=1;break
			rail_total+=1
	var rail_fraction:=float(rail_painted)/maxi(1,rail_total)
	check(rail_fraction>.4,"saved frame must contain the actual left tool rail: "+name)
	paint_checks.append({"name":name,"status":"pass" if fraction>.4 and rail_fraction>.4 else "fail","primaryButtonPaintFraction":fraction,"railButtonPaintFraction":rail_fraction})
func run():
	var args:=OS.get_cmdline_user_args()
	if args.size()<3:push_error("Expected output directory and at least two native Projects");quit(2);return
	directory=args[0];DirAccess.make_dir_recursive_absolute(directory);root.size=Vector2i(1000,700)
	if DisplayServer.get_name()=="headless":root.content_scale_size=root.size;root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var deadline:=Time.get_ticks_msec()+160000
	process_frame.connect(func():
		if Time.get_ticks_msec()>deadline:push_error("Scene-switch UI regression timed out");quit(1))
	main=load("res://main.tscn").instantiate();root.add_child(main);await process_frame
	var initial_hashes:Dictionary={}
	for path in args.slice(1):initial_hashes[path]=FileAccess.get_sha256(path)
	var attempt:=0
	for cycle in range(2):
		for path in args.slice(1):
			var old_id:int=0 if main._world==null else main._world.get_instance_id()
			main._launcher.get_node("ProjectPicker").file_selected.emit(path);await idle()
			check(main._world!=null and main._world.get_instance_id()!=old_id,"normal Project picker commits the newly compiled world")
			check(main._view_mode==main.ViewMode.PLAN and not paused,"Project switching enters usable plan mode")
			await paint("%02d-open-plan"%attempt)
			click(main._plan_view.find_child("OpenCatalog",true,false));await idle()
			check(main._plan_view._catalog_view.visible,"left tool rail opens the actual furniture catalog after switching")
			click(main._plan_view.find_child("OpenCatalog",true,false));await idle()
			check(not main._plan_view._catalog_view.visible,"left tool rail closes its catalog normally")
			click(main._plan_view.find_child("FirstPerson",true,false));await idle()
			check(main._view_mode==main.ViewMode.WALKTHROUGH and main._world.get_node("HUD").visible,"painted plan button actually enters walkthrough")
			key(KEY_F2);await idle()
			check(main._view_mode==main.ViewMode.PLAN,"normal F2 returns from walkthrough after scene switching")
			await paint("%02d-return-plan"%attempt)
			# Next open starts from walkthrough, covering the original sequence.
			click(main._plan_view.find_child("FirstPerson",true,false));await idle()
			attempt+=1
	for path in initial_hashes:check(FileAccess.get_sha256(path)==initial_hashes[path],"scene switching preserves source Project bytes")
	var file:=FileAccess.open(directory.path_join("scene-switch-ui-report.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"failures":failures,"projectOpens":attempt,"paintChecks":paint_checks,"renderer":RenderingServer.get_video_adapter_name(),"display":DisplayServer.get_name(),"sourceHashes":initial_hashes},"\t")+"\n");file.close()
	main.free();paused=false
	print("Native scene-switch controls and saved-pixel checks: ","PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
