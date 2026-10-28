extends SceneTree
var main
var directory:=""
var failures:=0
func _initialize():run.call_deferred()
func check(ok:bool,message:String):
	if ok:print("PASS spatial authoring: ",message)
	else:failures+=1;push_error(message)
func idle():
	var deadline:=Time.get_ticks_msec()+45000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if not main._session.busy and not main._architecture_editor.session.busy and not main._editing and not main._layout_camera.transitioning and not main._plan_view.spatial._queued and not main._plan_view.spatial._preview_busy:
			for i in range(3):await process_frame
			return
	check(false,"Spatial placement deadline")
func click(point:Vector2):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=point;event.pressed=true;root.push_input(event,true)
	event.pressed=false;root.push_input(event,true)
func drag(from:Vector2,to:Vector2):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=from;event.pressed=true;root.push_input(event,true)
	var motion:=InputEventMouseMotion.new();motion.button_mask=MOUSE_BUTTON_MASK_LEFT;motion.position=to;motion.relative=to-from;root.push_input(motion,true)
	event.position=to;event.pressed=false;root.push_input(event,true)
func zoom_out(tool):
	var wheel:=InputEventMouseButton.new();wheel.button_index=MOUSE_BUTTON_WHEEL_DOWN;wheel.pressed=true;wheel.position=Vector2(500,400)
	for i in range(3):tool._gui_input(wheel)
func project()->Dictionary:return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
func capture(name:String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(directory.path_join(name+".png"))
func run():
	var args:=OS.get_cmdline_user_args();directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	root.size=Vector2i(1280,800);root.gui_embed_subwindows=true
	if DisplayServer.get_name()=="headless":root.content_scale_size=root.size;root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var deadline:=Time.get_ticks_msec()+180000
	process_frame.connect(func():if Time.get_ticks_msec()>deadline:push_error("Spatial authoring wall-clock timeout");quit(1))
	main=load("res://main.tscn").instantiate();root.add_child(main);await process_frame
	check(await main._open_project(args[0]),"Open native Project");await idle()
	var f:Dictionary=project()["floors"][0];var floor_id:String=f["id"]
	var original:String=main._session.current()["projectPath"]
	var initial_walls:Array=f["walls"].duplicate(true)
	click(main._plan_view.find_child("BuildTools",true,false).get_global_rect().get_center());await process_frame
	check(main._plan_view.has_open_dialog() and not main._menu_open,"Build popup participates in window focus protection")
	main._plan_view.find_child("BuildTools",true,false).get_popup().hide();await process_frame
	var tool=main._plan_view.spatial
	check(main._runtime_data["colliders"].any(func(c):return c.get("purpose")=="perimeter"),"Existing floor outer edges have invisible runtime guards")
	# Explicit same-world native paving preview, then cancel without a command.
	tool.start_ground(main._session.current(),floor_id);await idle();zoom_out(tool)
	for p in [{"x":600,"y":0},{"x":900,"y":0},{"x":900,"y":600},{"x":600,"y":600}]:click(tool._screen(p))
	await idle();check(not tool._accepted.is_empty() and tool._points.size()==4,"Four actual plan clicks create a complete rectangular paving preview")
	await capture("ground-preview")
	tool.cancel();check(main._session.current()["projectPath"]==original,"Cancel paving leaves canonical Project and world unchanged")
	tool.start_ground(main._session.current(),floor_id);await idle();zoom_out(tool)
	for p in [{"x":600,"y":0},{"x":900,"y":0},{"x":900,"y":600},{"x":600,"y":600}]:click(tool._screen(p))
	await idle();tool._apply.pressed.emit();await idle()
	check(project()["floors"][0]["walls"]==initial_walls,"Paving commits ground without manufacturing native walls")
	check(main._session.is_dirty() and FileAccess.file_exists(main._session.current()["projectPath"]),"Accepted geometry remains saveable after replacing the world")
	tool=main._plan_view.spatial
	var grounds:Array=main._session.current()["authoring"]["floors"][0]["groundAreas"]
	check(grounds.size()==1,"New ground has a canonical explicit boundary")
	# Existing opening geometry uses the same spatial tool, preserving identity.
	var opening:Dictionary=main._session.current()["authoring"]["floors"][0]["openings"][0]
	main._show_opening_geometry(opening["id"]);await idle();tool=main._plan_view.spatial
	check(tool.mode=="door" and not main._architecture_editor.visible,"Size / position opens same-world placement instead of the wall form")
	var source_path:String=main._session.current()["projectPath"]
	tool._width.value=700;await idle()
	check(tool._accepted.is_empty() and tool._apply.disabled,"Too-wide opening cannot be confirmed or silently clamped")
	tool.cancel();check(main._session.current()["projectPath"]==source_path,"Cancel opening geometry retains source")
	main._show_opening_geometry(opening["id"]);await idle();tool=main._plan_view.spatial
	tool._width.value=80;await idle()
	drag(tool._screen(tool._request["point"]),tool._screen({"x":250,"y":0}));await idle()
	check(not tool._accepted.is_empty() and absf(tool._accepted.get("position",0)-250.0/600)<.00001,"Actual center drag positions the opening on its explicit wall")
	if not tool._outline.is_empty():
		drag(tool._screen(tool._outline[-1]),tool._screen({"x":300,"y":0}));await idle()
	check(not tool._accepted.is_empty() and absf(tool._accepted.get("width",0)-100)<.01,"Actual end-handle drag previews aperture width")
	tool._apply.pressed.emit();await idle()
	check(absf(project()["floors"][0]["doors"][0]["width"]-100)<.01,"Confirm writes the existing opening geometry")
	check(project()["floors"][0]["walls"]==initial_walls,"Opening placement does not alter its host wall")
	# Add chooses the very same categorized cards as Modify, then picks a host.
	main._object_editor.show_new_opening(main._session.current(),"window");main._object_editor.catalog.choose(2);main._object_editor.catalog.place.pressed.emit();await idle()
	tool=main._plan_view.spatial;click(tool._screen({"x":600,"y":300}));await idle()
	check(tool.mode=="window" and not tool._accepted.is_empty(),"New window choice enters an attached spatial preview")
	await capture("window-preview")
	tool._apply.pressed.emit();await idle()
	check(project()["floors"][0]["windows"].any(func(w):return w["type"]=="casement"),"Selected window style survives spatial addition")
	# Deliberate advanced correction is opt-in. Repeated edits require marked-wall opt-in.
	main._show_plan_editor();await idle();var editor=main._architecture_editor
	check(not editor.canvas.walls_enabled and editor.find_child("DrawCorrectionWall",true,false).disabled,"Wall correction starts protected")
	editor._wall_permission.button_pressed=true;editor._select("wall","w2")
	editor._fields["split"].value=50;editor.find_child("SplitCorrectionWall",true,false).pressed.emit();await idle()
	check(editor._floor["walls"].any(func(w):return w.get("authorModified",false)),"Explicit wall edit persists correction marks")
	check(editor.find_child("SplitCorrectionWall",true,false).disabled,"Marked wall is protected against repeated edits by default")
	var corrected:=directory.path_join("marked.project.json");check(editor.session.save_project(corrected)==OK,"Save protected correction")
	editor.hide();await main._open_corrected_project(corrected);await idle()
	check(main._session.current()["authoring"]["floors"][0]["walls"].filter(func(w):return w.get("authorModified",false)).size()==2,"Manual marks survive save/reopen and reach top view")
	await capture("marked-plan")
	var saved:=directory.path_join("spatial.project.json");check(main._session.save_project(saved)==OK,"Save final native paving and opening changes")
	check(await main._open_project(saved),"Reopen final Project through strict compiler");await idle()
	check(main._session.current()["authoring"]["floors"][0]["groundAreas"].size()==1,"Ground persists across reopen")
	# Test normal CharacterBody motion against an exposed external guard. This
	# synthetic fixture intentionally starts at the paving edge; real routes are separate.
	main._show_walkthrough();var player:CharacterBody3D=main._world.get_node("Player")
	player.position=Vector3(8.4,0,3);player.rotation.y=-PI/2
	Input.action_press("move_forward")
	for i in range(120):await physics_frame
	Input.action_release("move_forward")
	check(player.position.x<=8.73 and player.position.y>-.05,"Actual physics blocks walking beyond paved outer edge")
	main.queue_free();await process_frame
	if failures==0:print("PASS spatial paving/opening preview, cancellation, protected wall marks, save/reopen and actual perimeter collision")
	quit(1 if failures else 0)
