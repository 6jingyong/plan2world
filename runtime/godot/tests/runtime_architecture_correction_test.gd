extends SceneTree

var main
var directory:=""
var failures:=0

func _initialize() -> void:run.call_deferred()
func check(ok:bool,message:String) -> void:
	if ok:print("PASS architecture correction: ",message)
	else:push_error(message);failures+=1
func idle() -> void:
	for i in range(3):await process_frame
	while main._session.busy or main._editing or main._architecture_editor.session.busy:
		await process_frame
		OS.delay_msec(2)
	for i in range(3):await process_frame

func run() -> void:
	var args:=OS.get_cmdline_user_args();directory=args[0];root.size=Vector2i(1280,800);root.gui_embed_subwindows=true
	# --fixed-fps advances simulated time faster than real time headlessly.
	# The external shared core needs a wall-clock deadline, not a scene timer.
	var deadline:=Time.get_ticks_msec()+120000
	process_frame.connect(func():
		if Time.get_ticks_msec()>deadline:push_error("Architecture correction test exceeded 120 wall-clock seconds.");quit(1))
	main=load("res://main.tscn").instantiate();root.add_child(main);await process_frame
	check(not main._architecture_editor.visible,"correction window starts hidden and does not capture normal input")
	var opened_ok:bool=await main._open_project(directory.path_join("valid.project.json"));check(opened_ok,"open valid canonical Project")
	if not opened_ok:main.queue_free();await process_frame;quit(1);return
	await idle();var old_world:Node=main._world;var old_player:Node=main._world.get_node("Player")
	var original:=FileAccess.get_file_as_string(directory.path_join("broken.project.json"))
	main._show_plan_editor(directory.path_join("broken.project.json"));await idle()
	var editor=main._architecture_editor
	check(editor.visible and editor.session.current().get("ok",false),"broken plan opens in native correction UI")
	check(not editor.session.current()["walkthroughReady"] and editor._apply.disabled,"incomplete ground stays editable without a fake walkthrough")
	check(main._world==old_world and old_player==main._world.get_node("Player"),"correction candidate keeps active world and player")
	check(editor.canvas.floor["walls"].size()==3 and editor._issues.item_count==1,"source notes and individual wall segments are visible")
	await capture("correction-before")
	# Exercise the native canvas two-point wall-drawing input rather than only
	# invoking the shared command directly.
	editor.canvas.drawing=true
	for point in [{"x":0,"y":0},{"x":600,"y":0}]:
		var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.pressed=true;event.position=editor.canvas._screen(point);editor.canvas._gui_input(event)
	await idle()
	check(editor.canvas.floor["walls"].size()==4,"two canvas clicks add one canonical wall")
	await editor._command({"type":"opening-add","wallId":editor._id,"position":.25,"width":90,"kind":"door","doorType":"single"});await idle()
	var door_id:String=editor._id
	check(not editor.session.current()["walkthroughReady"],"a source correction requires an explicit entrance instead of a guessed start")
	await editor._command({"type":"set-entrance","id":door_id,"side":"left"});await idle()
	check(editor.session.current()["walkthroughReady"] and not editor._apply.disabled,"explicit wall, opening and entrance produce a strict compiled candidate")
	await editor._command({"type":"resolve-architecture-issue","id":"source-entry","resolved":true});await idle()
	var saved:=directory.path_join("corrected.project.json");check(editor.session.save_project(saved)==OK,"save corrected canonical Project")
	var snapshot:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(saved))
	check(snapshot["architectureReview"]["issues"][0]["sourceRecord"]=="Original synthetic observation retained." and snapshot["architectureReview"]["issues"][0]["resolved"],"explicit acknowledgement preserves original evidence")
	check(FileAccess.get_file_as_string(directory.path_join("broken.project.json"))==original,"source file was never overwritten")
	await capture("correction-ready")
	editor.hide();await main._open_corrected_project(editor.session.current()["projectPath"]);await idle()
	check(main._world!=old_world and main._runtime_data["floors"][0]["entranceDoorId"]==door_id,"accepted correction updates actual world geometry and entrance")
	var player:Node=main._world.get_node("Player");player.position=Vector3(3,0,3)
	var leaf_id:String="";var body:Node3D
	for collider in main._runtime_data["colliders"]:
		if collider["ownerId"]==door_id:leaf_id=collider["id"];body=main._collider_nodes[leaf_id];break
	main._show_walkthrough()
	var assembly=body.get_parent();assembly.interact()
	for i in range(40):await physics_frame
	player.position=Vector3(1.5,0,1.4)
	player.get_node("Camera3D").look_at(Vector3(1.5,1.05,0),Vector3.UP)
	check(main._adjustment.aimed_id()==door_id,"walkthrough selection ray targets the actual door")
	var opened:Transform3D=body.transform;var body_id:=body.get_instance_id();var assembly_id:=assembly.get_instance_id();var player_position:Vector3=player.position
	var key:=InputEventKey.new();key.keycode=KEY_M;key.physical_keycode=KEY_M;key.pressed=true;root.push_input(key,true)
	key.pressed=false;root.push_input(key,true);await idle()
	check(main._view_mode==main.ViewMode.WALKTHROUGH and main._object_editor.visible and Input.mouse_mode==Input.MOUSE_MODE_VISIBLE,"M opens the selected door's categorized editor during actual walkthrough")
	main._object_editor.catalog.choose(1);main._object_editor.catalog.place.pressed.emit();await idle()
	check(main._collider_nodes[leaf_id].get_instance_id()==body_id and body.transform.is_equal_approx(opened),"material swap preserves the same open leaf and collider")
	check(body.get_parent().get_instance_id()==assembly_id and assembly._opened,"door motion state is preserved")
	check(player==main._world.get_node("Player") and player.position.distance_to(player_position)<.01,"material swap keeps player and world")
	var ref:=""
	for child in body.get_children():
		if child.has_meta("p2w_asset_ref"):ref=child.get_meta("p2w_asset_ref")
	check(ref=="builtin:door-glass-leaf-v1","actual glass presentation asset replaces wood")
	var styled:=directory.path_join("glass.project.json");check(main._session.save_project(styled)==OK,"appearance saves in the canonical Project")
	check(await main._open_project(styled),"saved material reopens through the normal compiler")
	await idle();check(main._session.current()["doorAppearances"][0]["material"]=="glass","glass appearance survives reopen")
	main._show_menu();await capture("corrected-space")
	main.queue_free();await process_frame
	if failures==0:print("PASS native architecture correction, real canvas editing, canonical save/reopen and appearance-only door swap")
	quit(1 if failures else 0)

func capture(name:String) -> void:
	if DisplayServer.get_name()=="headless":return
	await process_frame;await process_frame
	root.get_texture().get_image().save_png(directory.path_join(name+".png"))
