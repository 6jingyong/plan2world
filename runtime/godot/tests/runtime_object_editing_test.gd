extends SceneTree
var main
var directory:=""
var failures:=0
func _initialize():run.call_deferred()
func check(ok:bool,text:String):
	if ok:print("PASS object editing: ",text)
	else:failures+=1;push_error(text)
func idle():
	var deadline:=Time.get_ticks_msec()+30000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if not main._session.busy and not main._editing and (not main._layout_camera.transitioning or main._object_editor.visible):
			for i in range(3):await physics_frame
			return
	check(false,"Object editing operation deadline")
func click(point:Vector2):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=point;event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func key(code:Key):
	var event:=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func capture(name:String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join(name+".png"))
func project()->Dictionary:return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
func pick(id:String):
	var camera=main._layout_camera;var e:Dictionary=camera._entities[id]
	var point:Array=e.get("position",e.get("closedPose",{}).get("center",e.get("center",[0,0,0])))
	click(camera.camera.unproject_position(camera._vec3(point)));await idle()
	check(camera.selected_id==id,"Actual plan ray selects "+id)
	check(not camera._moving and main._plan_view._selection_card.visible,"Selection shows compact Modify without moving "+id)
func run():
	var args:=OS.get_cmdline_user_args();directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	root.size=Vector2i(1280,800);root.gui_embed_subwindows=true
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,800);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var deadline:=Time.get_ticks_msec()+120000
	process_frame.connect(func():if Time.get_ticks_msec()>deadline:push_error("Object editing test wall-clock timeout");quit(1))
	main=load("res://main.tscn").instantiate();root.add_child(main);await process_frame
	check(not main._object_editor.visible,"New catalog window starts hidden")
	check(await main._open_project(args[0]),"Open authored canonical Project");await idle()
	var world_id:int=main._world.get_instance_id();var player=main._world.get_node("Player")
	var plan=main._plan_view;var controller=main._layout_camera
	await pick("sofa")
	check(plan._selection_card.get_combined_minimum_size().x<230,"Selection offers a small action chip")
	await capture("selected-furniture")
	click(plan._edit_buttons["ReplaceFurniture"].get_global_rect().get_center());await idle()
	check(plan._catalog_view.visible and plan._catalog_action=="ReplaceFurniture","Modify enters the existing add catalog in replacement mode")
	check(plan._catalog[plan._catalog_view.selected_index]["asset"]["catalogId"]=="sofa","Modify starts with the selected object's actual type")
	var revision:String=main._session.current()["projectPath"]
	plan._catalog_view._tabs.current_tab=0;plan._catalog_view._search.text="chair";plan._catalog_view._filter()
	key(KEY_ESCAPE);await idle()
	check(main._session.current()["projectPath"]==revision,"Closing a categorized choice leaves the source unchanged")
	await pick("main-entry")
	await capture("selected-door")
	click(plan._edit_buttons["ReplaceFurniture"].get_global_rect().get_center());await idle()
	var editor=main._object_editor
	check(editor.visible and editor.target["id"]=="main-entry" and editor.catalog.items.size()==3,"The selected door opens three material cards without an all-door selector")
	check(editor.catalog.get_script()==plan._catalog_view.get_script(),"Add, furniture Modify and opening Modify share the same catalog component")
	for choice in editor.catalog.items:
		var picture:=Image.new();check(picture.load_svg_from_string(choice["symbolSvg"])==OK,"Door card symbols load in the actual engine")
	editor.catalog.choose(1)
	check(main._session.current()["projectPath"]==revision,"Choosing a door thumbnail is not an edit")
	await capture("modify-door")
	editor.catalog.place.pressed.emit();await idle()
	check(project()["floors"][0]["doors"].filter(func(d):return d["id"]=="main-entry")[0]["material"]=="glass","Confirm applies only the selected door's material")
	check(main._world.get_instance_id()==world_id,"Door catalog keeps the current world")
	var hidden_upper:=true
	for saved in controller._visibility:
		var metadata:Dictionary=saved[0].get_meta("extras",{}).get("plan2world",{})
		if metadata.get("floorId")=="upper":hidden_upper=hidden_upper and not saved[0].visible
	check(hidden_upper,"Door appearance keeps other floors hidden in plan view")
	await pick("window")
	click(plan._edit_buttons["ReplaceFurniture"].get_global_rect().get_center());await idle()
	check(editor.visible and editor.target["id"]=="window" and editor.catalog.items.size()==5,"Windows enter categorized editing from their selected opening")
	await capture("modify-window")
	var collider_ids:Dictionary={}
	for id in main._collider_nodes:collider_ids[id]=main._collider_nodes[id].get_instance_id()
	editor.catalog.choose(3);editor.catalog.place.pressed.emit();await idle()
	check(project()["floors"][0]["windows"][0]["type"]=="sliding","Confirm saves the selected window type")
	check(main._world.get_instance_id()==world_id and main._world.get_node("Player")==player,"Window appearance keeps world and player")
	var same_bodies:=true
	for id in collider_ids:same_bodies=same_bodies and main._collider_nodes[id].get_instance_id()==collider_ids[id]
	check(same_bodies,"Window choice preserves every physics body")
	var frame:Node=main._world.get_node("Architecture").find_child("*window-frame*",true,false)
	check(frame!=null,"Window type supplies actual compiler-owned frame presentation")
	# A small native desktop still keeps the editor controls on screen.
	root.size=Vector2i(800,540)
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(800,540)
	main._show_object_editor("window");await idle()
	check(editor.size.x<=800 and editor.size.y<=540,"Object editing fits a compact desktop")
	await capture("compact-window");editor.hide();await idle()
	var saved:=directory.path_join("objects.project.json");check(main._session.save_project(saved)==OK,"Save the accepted canonical object choices")
	check(await main._open_project(saved),"Reopen saved object choices");await idle()
	check(project()["floors"][0]["windows"][0]["type"]=="sliding","Window choice survives reopen")
	main._show_walkthrough();await idle()
	player=main._world.get_node("Player");player.position=Vector3(5,.4,3.4)
	player.get_node("Camera3D").look_at(Vector3(5,.9,2),Vector3.UP)
	check(main._adjustment.aimed_id()=="sofa","Walkthrough aims at the selected furniture")
	key(KEY_M);await idle();editor=main._object_editor
	check(editor.visible and editor.target["id"]=="sofa","Walkthrough Modify uses the same classified furniture choices")
	revision=main._session.current()["projectPath"]
	for i in range(editor.catalog.items.size()):
		if editor.catalog.items[i]["asset"]["catalogId"]=="chair":editor.catalog.reveal(i);break
	editor.catalog.place.pressed.emit();await idle()
	check(controller!=main._layout_camera,"Reopen has its own current native camera")
	check(main._view_mode==main.ViewMode.PLAN and main._layout_camera.has_placement_preview(),"Walkthrough replacement enters the existing game placement preview")
	check(main._session.current()["projectPath"]==revision,"Placement preview does not commit a chosen replacement")
	key(KEY_ESCAPE);await idle()
	check(not main._layout_camera.has_placement_preview() and main._session.current()["projectPath"]==revision,"Cancelling the replacement preserves the accepted Project")
	main.free();paused=false
	print("Native selected-object chip / shared categorized catalog / explicit apply-cancel / door-window save and physics: ","PASS" if failures==0 else "FAIL (%d)"%failures)
	quit(1 if failures else 0)
