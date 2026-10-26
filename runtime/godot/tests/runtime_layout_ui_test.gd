extends SceneTree

const MAIN := preload("res://main.tscn")
var main
var failures := 0
var directory := ""
func _initialize(): _run.call_deferred()
func _check(value: bool, text: String):
	if not value: failures+=1; push_error(text)
func _idle():
	var deadline := Time.get_ticks_msec()+30000
	while Time.get_ticks_msec()<deadline:
		await process_frame; OS.delay_msec(2)
		if not main._session.busy and not main._editing and main._layout_camera!=null and not main._layout_camera.transitioning:
			for i in range(3): await physics_frame
			if not main._session.busy and not main._editing and not main._layout_camera.transitioning: return
	_check(false,"Native furnishing UI must finish within its existing deadline")
func _capture(name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"Native furnishing UI capture must save")
func _key(code: Key, ctrl:=false):
	var event:=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.ctrl_pressed=ctrl;event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func _click_at(point: Vector2):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=point;event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func _click(control: Control):
	var window := control.get_window()
	var point := control.get_global_rect().get_center()
	if window != root and window.is_embedded():
		# Translate embedded-window client coordinates into its containing viewport.
		point += Vector2(window.position)
		_click_at(point)
	else:
		var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT
		event.position=point;event.pressed=true;window.push_input(event,true)
		event.pressed=false;window.push_input(event,true)
func _search(text: String):
	var field: LineEdit=main._plan_view._catalog_view._search
	_click(field);_key(KEY_A,true);_key(KEY_BACKSPACE)
	for letter in text:
		var event:=InputEventKey.new();event.keycode=letter.to_upper().unicode_at(0);event.unicode=letter.unicode_at(0);event.pressed=true
		root.push_input(event,true);event.pressed=false;root.push_input(event,true)
	await process_frame
func _project() -> Dictionary: return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
func _count() -> int: return _project()["floors"][0]["furniture"].size()
func _item(id: String) -> Dictionary: return _project()["floors"][0]["furniture"].filter(func(item):return item["id"]==id)[0]
func _run():
	if DisplayServer.get_name()=="headless":
		root.content_scale_size=Vector2i(1280,720);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var args:=OS.get_cmdline_user_args()
	if args.size()!=2: push_error("Expected native Project and capture directory");quit(2);return
	directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	var original:=FileAccess.get_sha256(args[0])
	main=MAIN.instantiate();root.add_child(main);await process_frame
	main._open_project(args[0]);await _idle()
	var camera=main._layout_camera
	_check(camera.camera.projection==Camera3D.PROJECTION_ORTHOGONAL,"Settled arrangement must use an orthographic camera")
	var low: Vector2=camera.camera.unproject_position(Vector3(6,0,6))
	var high: Vector2=camera.camera.unproject_position(Vector3(6,2.8,6))
	_check(low.distance_to(high)<.001,"Wall tops and floor points with the same plan coordinates must align without perspective parallax")
	_check(camera.camera.project_ray_normal(Vector2(200,200)).is_equal_approx(camera.camera.project_ray_normal(Vector2(700,500))),"Orthographic picking rays must be parallel throughout the viewport")
	var plan=main._plan_view
	var browser=plan._catalog_view
	var world_id=main._world.get_instance_id()
	var before:=_count()
	var architecture:=FileAccess.get_sha256(P2WRuntimeArtifacts.new().default_architecture_path(str(main._session.current()["runtimePath"])))
	_check(architecture.length()==64 and architecture==main._runtime_data["source"]["architectureSha256"],"Ownership checks must hash the actual architecture GLB and match the compiler digest")
	_check(not browser.visible and not plan._selection_card.visible and camera.inset_right==16,"Idle arrangement must expose the room, without a permanent furniture inspector")
	await _capture("room-first")
	camera._center=Vector2(6.25,6.1);camera._size*=.9
	var chosen_center: Vector2=camera.view_center()
	var zoom: float=camera._size/camera._fit_size()
	_key(KEY_TAB);await _idle()
	_check(browser.visible and plan._catalog_toggle.button_pressed,"Tab must open the real visual catalog")
	_check(camera.view_center().is_equal_approx(chosen_center) and is_equal_approx(camera._size/camera._fit_size(),zoom),"Opening inventory must preserve the chosen plan centre and relative zoom")
	_check(browser.list.item_count>100 and browser.list.get_item_icon(0)!=null,"Inventory must show visual native furniture symbols, not a flat dropdown")
	await _capture("catalog-all")
	_key(KEY_TAB);await _idle()
	_check(not browser.visible,"Tab must close inventory even while its real grid has keyboard focus")
	_key(KEY_TAB);await _idle()
	var cancel:=InputEventJoypadButton.new();cancel.button_index=JOY_BUTTON_B;cancel.pressed=true
	root.push_input(cancel,true);cancel.pressed=false;root.push_input(cancel,true);await _idle()
	_check(not browser.visible,"Gamepad B must close the visual catalog independently of first-person controls")
	_key(KEY_TAB);await _idle()
	_key(KEY_F,true)
	_check(root.gui_get_focus_owner()==browser._search,"Ctrl+F must focus catalog search")
	for item in plan._catalog:
		var picture:=Image.new()
		_check(picture.load_svg_from_string(item["symbolSvg"])==OK and picture.get_size()==Vector2i(72,72),"Every shared catalog symbol must load in real Godot")
		if item["asset"]["catalogId"]=="chair":
			var pixel:=picture.get_pixel(36,36)
			_check(pixel.r>.1 and pixel.b>.1 and pixel.a>.1,"Native SVG rasterization must preserve the colored translucent chair instead of black fill")
	var tabs: TabBar=browser._tabs
	_click_at(tabs.global_position+tabs.get_tab_rect(2).get_center())
	await process_frame
	_check(tabs.current_tab==2 and browser._categories[2]=="Bedroom" and browser.list.item_count>0,"Native category tabs must filter the inventory")
	await _search("bed")
	_key(KEY_TAB);await _idle();_key(KEY_TAB);await _idle()
	_check(tabs.current_tab==2 and browser._search.text=="bed" and browser.list.item_count>=2,"Inventory must retain category and search across closing/reopening")
	for index in browser._visible_indices: _check(plan._catalog[index]["category"]=="Bedroom","A category may not display pieces from another category")
	_click_at(tabs.global_position+tabs.get_tab_rect(0).get_center());await process_frame
	await _search("armchair")
	_check(browser.list.item_count==1,"Actual text input must search the visual catalog")
	_click_at(browser.list.global_position+browser.list.get_item_rect(0).get_center())
	_check(plan._catalog[browser.selected_index]["asset"]["catalogId"]=="chair" and _count()==before,"Selecting a thumbnail must not edit the Project or click through to world selection")
	await _capture("catalog-search")
	await _search("no matching piece")
	_check(browser.list.item_count==0 and browser.place.disabled and browser.selected_index==-1,"Empty search results must disable placement, never add a stale choice")
	await _search("armchair")
	_click_at(browser.list.global_position+browser.list.get_item_rect(0).get_center())
	_click(browser.place);await _idle()
	var id: String=main._session.current()["selectedId"]
	_check(not browser.visible and plan._selection_card.visible and _count()==before+1,"Accepted placement must return to the room with contextual piece actions")
	_check(absf(float(_item(id)["position"]["x"])-625)<.0001 and absf(float(_item(id)["position"]["y"])-610)<.0001,"The inventory must add at the preserved view centre")
	_check(camera.view_center().is_equal_approx(chosen_center),"Closing inventory after placement must retain the chosen location")
	await _capture("piece-actions")
	_key(KEY_R);await _idle()
	_check(_item(id)["rotation"]==90,"Contextual keyboard rotation must invoke the native editing path")
	var revision: String=main._session.current()["projectPath"]
	var press:=InputEventMouseButton.new();press.button_index=MOUSE_BUTTON_LEFT;press.pressed=true
	press.position=camera.camera.unproject_position(camera._vec3(camera._entities[id]["position"]))
	root.push_input(press,true)
	_check(camera._moving,"Actual room press must start a pending furniture gesture")
	_key(KEY_TAB);await _idle()
	_check(browser.visible and not camera._moving and main._session.current()["projectPath"]==revision,"Opening inventory must cancel a pending gesture without accepting an edit")
	press.pressed=false;root.push_input(press,true)
	_key(KEY_ESCAPE);await _idle()
	_click(plan.find_child("ReplaceFurniture",true,false));await _idle()
	_check(browser.visible and plan._catalog_action=="ReplaceFurniture","Swap must open the same visual catalog in explicit replacement mode")
	await _search("coffee table")
	_click_at(browser.list.global_position+browser.list.get_item_rect(0).get_center())
	_check(main._session.current()["projectPath"]==revision,"Choosing a replacement must preserve the accepted layout until confirmed")
	_click(browser.place);await _idle()
	_check(_count()==before+1 and main._session.current()["selectedId"]==id and _item(id)["catalogId"]=="coffee_table","Confirming Swap must retain the native identity and item count")
	_key(KEY_TAB);await _idle();await _search("wall art")
	_click_at(browser.list.global_position+browser.list.get_item_rect(0).get_center())
	_click(browser.place);await process_frame
	_check(plan._mount_dialog.visible and plan._wall_selector.is_visible_in_tree(),"Wall placement must request an explicit installation host in its own dialog")
	plan._wall_selector.select(plan._wall_ids.find("ground-w0"));plan._mount_side.select(0);plan._mount_height.value=140
	await _capture("wall-installation")
	_click(plan._mount_dialog.get_cancel_button());await process_frame
	_check(not plan._mount_dialog.visible and _count()==before+1 and browser.visible,"Cancelling wall installation must keep the catalog and leave native data unchanged")
	_key(KEY_ESCAPE);await _idle()
	_check(not browser.visible and not main._menu_open,"Escape from inventory must close it without leaving arrangement mode")
	# Compact inventory must fit as a drawer; controls may not expand off-screen.
	var size:=root.size
	root.size=Vector2i(800,540)
	if DisplayServer.get_name()=="headless": root.content_scale_size=Vector2i(800,540)
	await _idle();_key(KEY_TAB);await _idle()
	await _capture("compact-inventory")
	var viewport:=Rect2(Vector2.ZERO,root.get_visible_rect().size)
	for control in [browser,browser.place,browser._search,browser._tabs,plan._catalog_toggle]:
		_check(viewport.encloses(control.get_global_rect()),"Compact native inventory must keep its real controls in the viewport: "+str(control.name))
	_check(camera.inset_right>300 and camera.view_center().is_equal_approx(chosen_center),"Compact inventory framing must reserve the actual drawer without recentering the plan")
	_key(KEY_ESCAPE);await _idle()
	_click_at(camera.camera.unproject_position(Vector3(6,.4,3)));await process_frame
	_check(camera.selected_id.is_empty() and not plan._selection_card.visible,"Clicking empty room space must dismiss piece actions")
	root.size=size
	if DisplayServer.get_name()=="headless": root.content_scale_size=Vector2i(1280,720)
	await _idle()
	_click(plan._files);await process_frame
	_check(plan._files.get_popup().visible and plan.has_open_dialog(),"Save and export must be available in the secondary native layout menu")
	plan._files.get_popup().hide()
	_key(KEY_S,true);await process_frame
	_check(plan._save.visible,"Ctrl+S must open the existing native save dialog")
	plan._save.hide()
	var saved:=directory.path_join("layout.project.json")
	_check(main._session.save_project(saved)==OK,"The new UI must still save the canonical Project")
	_check(main._world.get_instance_id()==world_id and FileAccess.get_sha256(args[0])==original and FileAccess.get_sha256(P2WRuntimeArtifacts.new().default_architecture_path(str(main._session.current()["runtimePath"])))==architecture,"Catalog/actions must preserve world, original source and architectural bytes")
	main.free();paused=false
	print("Runtime game-style furnishing UI: ","PASS" if failures==0 else "FAIL (%d)"%failures)
	quit(0 if failures==0 else 1)
