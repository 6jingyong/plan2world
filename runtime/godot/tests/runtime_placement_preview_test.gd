extends SceneTree
const MAIN:=preload("res://main.tscn")
var main
var failures:=0
var directory:=""
func _initialize():run.call_deferred()
func check(value:bool,text:String):
	if not value:failures+=1;push_error(text)
func idle():
	var deadline:=Time.get_ticks_msec()+30000
	while main._session.busy or main._editing or (main._layout_camera!=null and main._layout_camera.transitioning):
		await process_frame;OS.delay_msec(2)
		if Time.get_ticks_msec()>deadline:check(false,"Placement operation must finish");return
	for i in range(3):await physics_frame
func count() -> int:return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))["floors"][0]["furniture"].size()
func choose(id:String):
	main._plan_view.set_catalog_open(true)
	for i in range(main._plan_view._catalog.size()):
		if main._plan_view._catalog[i]["asset"]["catalogId"]==id:main._plan_view._catalog_view.choose(i);break
	main._plan_view._catalog_view.place.pressed.emit();await idle()
func click(point:Vector3):
	var screen:Vector2=main._layout_camera.camera.unproject_position(point)
	var motion:=InputEventMouseMotion.new();motion.position=screen;root.push_input(motion,true)
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=screen;event.pressed=true;root.push_input(event,true);event.pressed=false;root.push_input(event,true)
	await idle()
func escape():
	var key:=InputEventKey.new();key.keycode=KEY_ESCAPE;key.pressed=true;root.push_input(key,true);key.pressed=false;root.push_input(key,true);await idle()
func capture(name:String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(directory.path_join(name+".png"))
func run():
	var args:=OS.get_cmdline_user_args();if args.size()!=2:quit(2);return
	directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,720);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	main=MAIN.instantiate();root.add_child(main);await process_frame;main._open_project(args[0]);await idle()
	var plan=main._plan_view;var camera=main._layout_camera;var before:=count();var revision:String=main._session.current()["projectPath"]
	await choose("chair");check(camera.has_placement_preview() and count()==before,"New item must remain a provisional spatial preview")
	await click(Vector3(9,.4,5));check(camera.has_placement_preview() and main._session.current()["projectPath"]==revision,"Clicking over a floor hole must preserve the pending preview and accepted Project")
	await capture("invalid-landing");await escape();check(not camera.has_placement_preview() and count()==before,"Escape must cancel without accepting a new item")
	await choose("chair");camera.select_floor("upper");check(not camera.has_placement_preview() and count()==before,"Changing floor must cancel provisional placement")
	camera.select_floor("ground");await idle()
	await choose("wall_art");check(plan._mount_dialog.visible,"Wall items require an explicit installation dialog")
	plan.find_child("PickMountWall",true,false).pressed.emit();await click(Vector3(6,3.4,0))
	check(plan._mount_dialog.visible and plan._wall_ids[plan._wall_selector.selected]=="ground-w0","Plan picking must select the exact wall owner")
	plan._mount_side.select(0);plan._mount_height.value=140;plan._mount_dialog.hide();plan._mount_dialog.confirmed.emit();await idle()
	check(camera.has_placement_preview() and camera._entities[camera.selected_id]["movement"]["wallId"]=="ground-w0","Wall preview must use the shared native frame")
	await capture("wall-preview");await click(Vector3(6,2.1,.126));check(count()==before+1,"Clicking a valid mounted preview must accept it once")
	var wall_id:String=main._session.current()["selectedId"]
	plan._layer_selector.select(1);plan._layer_selector.item_selected.emit(1);await idle()
	await choose("ceiling_light");check(plan._ceiling_dialog.visible,"Ceiling items require an explicit ceiling")
	plan.find_child("PickMountCeiling",true,false).pressed.emit();await click(Vector3(6,.4,6))
	check(plan._ceiling_dialog.visible,"Clicking inside a supported ceiling must identify its emitted room")
	plan._ceiling_dialog.hide();plan._ceiling_dialog.confirmed.emit();await idle()
	check(camera.has_placement_preview() and camera._entities[camera.selected_id]["movement"]["kind"]=="ceiling","Ceiling preview must retain its explicit host and height")
	await capture("ceiling-preview");await click(Vector3(6.5,3.3,5.5));check(count()==before+2,"Ceiling placement must commit after spatial confirmation")
	plan._layer_selector.select(0);plan._layer_selector.item_selected.emit(0);camera.selected_id="sofa";plan._selection_changed();plan.set_catalog_open(true,true)
	for i in range(plan._catalog.size()):
		if plan._catalog[i]["asset"]["catalogId"]=="chair":plan._catalog_view.choose(i);break
	var model:Node3D=main._furniture_models["sofa"];var was_visible:bool=model.visible
	plan._catalog_view.place.pressed.emit();await idle();check(camera.has_placement_preview(),"Swap must prepare a preview")
	await escape();check(model.visible==was_visible and count()==before+2,"Cancel swap must restore the existing model")
	await choose("chair");main._notification(Node.NOTIFICATION_WM_WINDOW_FOCUS_OUT);await process_frame
	check(main._menu_open and not camera.has_placement_preview() and count()==before+2,"Focus loss must cancel pending placement and pause")
	main._resume();await idle()
	var saved:=directory.path_join("placed.project.json");check(main._session.save_project(saved)==OK,"Accepted placement must save")
	var source:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(saved));var item:Dictionary=source["floors"][0]["furniture"].filter(func(piece):return piece["id"]==wall_id)[0]
	check(item["wallMount"]["wallId"]=="ground-w0" and item["wallMount"]["side"]=="left" and is_equal_approx(item["wallMount"]["elevation"],140),"Saved placement must retain explicit wall, side and height")
	check(DirAccess.open(main._session._directory).get_directories().size()==1,"Read-only previews must not retain provisional Project directories")
	main._session._dirty=false;main.free();await process_frame
	print("Spatial preview / cancel / holes / exact host picking / native save: ","PASS" if failures==0 else "FAIL (%d)"%failures);quit(0 if failures==0 else 1)
