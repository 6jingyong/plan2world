extends SceneTree
var main
var directory:=""
var failures:=0
var checks:Array=[]
func _initialize():run.call_deferred()
func check(ok:bool,text:String):
	checks.append({"check":text,"passed":ok})
	if ok:print("PASS artwork image: ",text)
	else:failures+=1;push_error(text)
func idle():
	var deadline:=Time.get_ticks_msec()+30000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if not main._session.busy and not main._editing and (not main._layout_camera.transitioning or main._object_editor.visible):
			for i in range(3):await physics_frame
			return
	check(false,"Artwork operation deadline")
func click(point:Vector2):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=point;event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func project()->Dictionary:return JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
func capture(name:String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory.path_join(name+".png"))
func image_pixels(node:Node)->Image:
	if node is MeshInstance3D:
		for i in range(node.mesh.get_surface_count()):
			var material=node.get_active_material(i)
			if material is BaseMaterial3D and material.albedo_texture!=null:return material.albedo_texture.get_image()
	for child in node.get_children():
		var found:=image_pixels(child)
		if found!=null:return found
	return null
func run():
	var args:=OS.get_cmdline_user_args();directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	root.size=Vector2i(1280,800);root.gui_embed_subwindows=true
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,800);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var deadline:=Time.get_ticks_msec()+120000
	process_frame.connect(func():if Time.get_ticks_msec()>deadline:push_error("Artwork test wall-clock timeout");quit(1))
	var picture:=Image.create(120,80,false,Image.FORMAT_RGB8)
	for y in range(80):
		for x in range(120):picture.set_pixel(x,y,Color.RED if x<60 and y<40 else Color.GREEN if y<40 else Color.BLUE if x<60 else Color.YELLOW)
	var source:=directory.path_join("本地画作 with spaces.png");picture.save_png(source)
	var jpeg:=directory.path_join("local photo.jpg");picture.save_jpg(jpeg)
	var invalid:=directory.path_join("invalid.png");var file:=FileAccess.open(invalid,FileAccess.WRITE);file.store_string("not an image");file.close()
	main=load("res://main.tscn").instantiate();root.add_child(main);await process_frame
	check(await main._open_project(args[0]),"Open canonical native input");await idle()
	main._edit_layout({"type":"add","floorId":"ground","position":{"x":600,"y":0},"asset":{"catalogId":"wall_art"},"wallMount":{"wallId":"ground-w0","side":"left","elevation":110}});await idle()
	var id:String=main._session.current()["selectedId"];var revision:String=main._session.current()["projectPath"]
	var initial:Dictionary=project();var world_id:int=main._world.get_instance_id();var player=main._world.get_node("Player");var architecture_id:int=main._world.get_node("Architecture").get_instance_id()
	var entity:Dictionary=main._layout_camera._entities[id];var original_size:Array=entity["size"].duplicate();var original_movement:Dictionary=entity["movement"].duplicate(true)
	click(main._layout_camera.camera.unproject_position(main._layout_camera._vec3(entity["position"])));await idle()
	check(main._layout_camera.selected_id==id,"Actual plan ray selects mounted artwork")
	click(main._plan_view._edit_buttons["ReplaceFurniture"].get_global_rect().get_center());await idle()
	var editor=main._object_editor;var dialog=editor.image_dialog
	check(editor.visible and editor.target["id"]==id and editor._art_image.visible,"Compact Modify opens categorized editor with Import picture action")
	editor._art_image.pressed.emit();await process_frame
	check(dialog.visible and dialog.get_ok_button().disabled,"Picture dialog requires a local decoded preview")
	dialog.picker.file_selected.emit(invalid);await process_frame
	check(dialog.get_ok_button().disabled and main._session.current()["projectPath"]==revision,"Invalid picture stays local and cannot be applied")
	dialog.picker.file_selected.emit(jpeg);await process_frame
	check(not dialog.get_ok_button().disabled and dialog.preview.texture!=null,"JPG decodes locally for preview")
	dialog.rotate.pressed.emit();check(dialog._image.get_width()==80 and dialog._image.get_height()==120,"Preview rotation changes pixels only")
	dialog.hide();editor.hide();await idle()
	check(main._session.current()["projectPath"]==revision,"Cancel retains the current Project and frame")
	main._show_object_editor(id);await idle();editor._art_image.pressed.emit();await process_frame
	dialog.picker.file_selected.emit(source);await process_frame
	check(dialog.preview.texture.get_width()==120 and dialog.preview.texture.get_height()==80,"Local PNG preview preserves its aspect")
	await capture("artwork-preview")
	root.size=Vector2i(800,540)
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(800,540)
	dialog.hide();dialog.show_image();dialog.select_image(source)
	for i in range(5):await process_frame
	check(dialog.size.x<=752 and dialog.size.y<=492 and dialog.position.x>=0 and dialog.position.y>=20,"Picture preview and Apply fit a compact desktop")
	await capture("artwork-compact-preview")
	root.size=Vector2i(1280,800)
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,800)
	dialog.confirmed.emit();await idle()
	check(main._session.current()["projectPath"]!=revision,"Apply image commits a new candidate only after compile")
	entity=main._layout_camera._entities[id]
	check(entity["size"]==original_size and entity["movement"]==original_movement,"Imported image keeps frame dimensions and authored wall movement")
	check(main._world.get_instance_id()==world_id and main._world.get_node("Player")==player and main._world.get_node("Architecture").get_instance_id()==architecture_id,"Image replacement keeps world, architecture, player and other objects")
	var texture:=image_pixels(main._furniture_models[id])
	check(texture!=null,"Actual Godot GLB importer supplies a textured frame")
	if texture!=null:check(texture.get_pixel(10,10).r>.9 and texture.get_pixel(100,10).g>.4 and texture.get_pixel(10,70).b>.9,"Imported texture retains distinct top-left/right and bottom-left pixels")
	var saved:=directory.path_join("artwork.project.json");check(main._session.save_project(saved)==OK,"Save self-contained canonical Project")
	var exported:=directory.path_join("artwork.runtime.zip");check(main._session.export_runtime(exported)==OK,"Export self-contained offline runtime scene")
	# Removing both source files proves the reopened scene uses retained attachments.
	DirAccess.remove_absolute(source);DirAccess.remove_absolute(jpeg)
	check(await main._open_project(saved),"Reopen saved Project after original picture is gone");await idle()
	check(image_pixels(main._furniture_models[id])!=null,"Saved artwork still has an embedded texture")
	main._show_walkthrough();await idle()
	player=main._world.get_node("Player");player.position=Vector3(6,.4,2.5);player.get_node("Camera3D").look_at(main._layout_camera._vec3(main._layout_camera._entities[id]["position"]),Vector3.UP)
	await capture("artwork-walkthrough")
	main._show_object_editor(id);await idle()
	check(editor._clear_image.visible,"Walkthrough Modify can remove just the picture")
	editor._clear_image.pressed.emit();await idle()
	check(main._layout_camera._entities[id]["assetRef"]=="builtin:wall_art-v1","Remove picture restores the generic frame without deleting the item")
	check(project()["floors"][0]["walls"]==initial["floors"][0]["walls"],"Image import/removal never changes native walls")
	var report:=FileAccess.open(directory.path_join("report.json"),FileAccess.WRITE);report.store_string(JSON.stringify({"checks":checks,"failures":failures,"savedProject":saved,"runtimePackage":exported}));report.close()
	main.free();paused=false
	print("Native artwork local PNG/JPG preview/cancel/apply/save/reopen/export: ","PASS" if failures==0 else "FAIL (%d)"%failures)
	quit(1 if failures else 0)
