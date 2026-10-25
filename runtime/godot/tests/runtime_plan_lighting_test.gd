extends SceneTree

const MAIN:=preload("res://main.tscn")
var main
var failures:=0
var directory:=""
func _initialize():_run.call_deferred()
func _check(value:bool,message:String):
	if not value:failures+=1;push_error(message)
func _frames(count:int):
	for i in range(count):await physics_frame
func _idle():
	var deadline:=Time.get_ticks_msec()+30000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if not main._session.busy and not main._editing and main._layout_camera!=null and not main._layout_camera.transitioning:
			await _frames(3)
			if not main._session.busy and not main._editing and not main._layout_camera.transitioning:return
	_check(false,"Plan/lighting changes must settle within their existing deadline")
func _key(code:Key):
	var event:=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.pressed=true;root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func _click(control:Control):
	var window:=control.get_window();var point:=control.get_global_rect().get_center()
	if window!=root and window.is_embedded():point+=Vector2(window.position)
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=point;event.pressed=true;root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func _mouse(point:Vector2,pressed:bool):
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=point;event.pressed=pressed;root.push_input(event,true)
func _capture(name:String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"Lighting image must save")
func _item(id:String) -> Dictionary:
	for entity in main._runtime_data["entities"]:
		if entity["id"]==id:return entity
	return {}
func _plan_markers(node:Node,result:Array):
	if node.get_meta("extras",{}).get("plan2world",{}).get("view")=="plan":result.append(node)
	for child in node.get_children():_plan_markers(child,result)
func _light_settings(enabled:bool,lumens:float,temperature:float):
	_key(KEY_L);await process_frame
	_check(main._light_settings.dialog.visible and paused,"L must open a native light dialog with the world paused")
	main._light_settings._enabled.button_pressed=enabled;main._light_settings._lumens.value=lumens;main._light_settings._temperature.value=temperature
	_click(main._light_settings.dialog.get_ok_button());await _idle();await _frames(3)
	_check(not paused and not main._light_settings.dialog.visible,"Applying light settings must restore the current view after the shared edit finishes")
func _floor_color(entity:Dictionary) -> Color:
	if DisplayServer.get_name()=="headless":return Color.BLACK
	await RenderingServer.frame_post_draw
	var image:=root.get_texture().get_image();var camera:Camera3D=main._world.get_node("Player/Camera3D")
	var sum:=Color(0,0,0,0);var count:=0
	for offset in [Vector2(-.35,-.35),Vector2(.35,-.35),Vector2(-.35,.35),Vector2(.35,.35)]:
		var screen:=camera.unproject_position(Vector3(entity["position"][0]+offset.x,main._runtime_data["floors"][0]["elevation"]+.005,entity["position"][2]+offset.y))
		_check(Rect2(Vector2.ZERO,Vector2(image.get_size())).has_point(screen),"Photometric samples must lie in the actual viewport")
		if screen.x>=0 and screen.y>=0 and screen.x<image.get_width() and screen.y<image.get_height():sum+=image.get_pixel(int(screen.x),int(screen.y));count+=1
	return sum/maxi(count,1)
func _run():
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,720);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var args:=OS.get_cmdline_user_args();directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	var original:=FileAccess.get_sha256(args[0])
	main=MAIN.instantiate();root.add_child(main);await process_frame
	main._open_project(args[0]);await _idle()
	var controller=main._layout_camera;var plan=main._plan_view;var style=main._world.get_node("ViewStyle")
	var world_id:int=main._world.get_instance_id()
	var architecture:=FileAccess.get_sha256(main._session.current()["runtimePath"].get_basename()+".architecture.glb")
	_check(controller.camera.projection==Camera3D.PROJECTION_ORTHOGONAL and style.plan,"Plan must use orthographic projection in the shared world")
	_check(not style._sun.visible and not style._environment.ssao_enabled and style._environment.ambient_light_energy==0,"Plan must disable sun, shadows and ambient/SSAO lighting")
	var markers:Array=[];_plan_markers(main._world.get_node("Architecture"),markers)
	_check(markers.size()>0,"Compiler GLB must provide aperture markers without adapter meshing")
	for marker in markers:
		var info:Dictionary=marker.get_meta("extras")["plan2world"]
		_check(marker.visible==(info["floorId"]==controller.floor_id),"Plan aperture markers must follow authored floor visibility")
		if marker.visible and marker is MeshInstance3D:_check(marker.material_override.shading_mode==BaseMaterial3D.SHADING_MODE_UNSHADED,"Plan opening bands must be unlit")
	await _capture("flat-plan")
	plan._layer_selector.select(1);plan._layer_selector.item_selected.emit(1);await process_frame
	_check(controller.ceiling_editing,"Ceiling lights need a distinct native editing layer")
	_key(KEY_TAB);await _idle()
	var catalog=plan._catalog_view
	_check(catalog.list.item_count==4,"Ceiling inventory must expose exactly the four supported ceiling light types")
	for index in catalog._visible_indices:_check(plan._catalog[index]["mounting"]=="ceiling","The ceiling layer must not edit floor furniture")
	controller._center=Vector2(5,6);controller.camera.global_transform=controller._top_pose()
	var original_revision:String=main._session.current()["projectPath"]
	_click(catalog.place);await process_frame
	_check(plan._ceiling_dialog.visible,"A new light must request an explicit supported ceiling")
	await _frames(3)
	for index in range(plan._ceiling_hosts.size()):
		if plan._ceiling_hosts[index]["ceilingWallIds"].has("ground-w0"):plan._ceiling_selector.select(index);break
	_click(plan._ceiling_dialog.get_ok_button());await _idle()
	# The authored fixture has an internal wall ending at (5,6): retain this
	# rejection, then choose an actual clear location without editing the fixture.
	_check(main._session.current()["projectPath"]==original_revision and plan._message.text.contains("overlaps"),"A ceiling light must not occupy the authored internal wall")
	controller._center=Vector2(5,7);controller.camera.global_transform=controller._top_pose()
	_click(catalog.place);await _frames(3);_click(plan._ceiling_dialog.get_ok_button());await _idle()
	_check(main._session.current().get("selectedId")!=null,"Confirmed ceiling placement must commit: "+plan._message.text)
	if main._session.current().get("selectedId")==null:main.free();paused=false;quit(1);return
	var id:String=main._session.current()["selectedId"];var entity:=_item(id)
	_check(entity.get("movement",{}).get("kind")=="ceiling" and entity.has("light"),"The shared compiler must emit a real attached light")
	if not entity.has("light"):main.free();paused=false;quit(1);return
	_check(is_equal_approx(entity["position"][1]+entity["size"][1]/2,entity["movement"]["elevation"]),"Fixture tops must stay flush with the emitted ceiling")
	_check(main._furniture_models.has(id) and main._furniture_models[id].get_meta("p2w_asset_ref")=="builtin:ceiling_light-v1","Ceiling fixture presentation must come from a packaged asset")
	for area in controller._areas.get_children():
		var item:Dictionary=controller._entities[area.get_meta("furniture_id")]
		_check((area.collision_layer==2)==(item["floorId"]==controller.floor_id and item["movement"]["kind"]=="ceiling"),"Layer switching must filter native picking areas without altering physics")
	await _capture("ceiling-layer")
	var start:Vector3=controller._vec3(entity["position"])
	_mouse(controller.camera.unproject_position(start),true)
	var motion:=InputEventMouseMotion.new();motion.position=controller.camera.unproject_position(start+Vector3(.23,0,.17));root.push_input(motion,true)
	_check(controller._moving and is_equal_approx(controller._preview.y,start.y),"Actual ceiling dragging must preserve installation height")
	_mouse(motion.position,false);await _idle();entity=_item(id)
	_check(is_equal_approx(entity["position"][1],start.y) and entity["position"][0]!=start.x,"Ceiling drag must persist horizontal movement through the native core")
	var revision:String=main._session.current()["projectPath"]
	_mouse(controller.camera.unproject_position(controller._vec3(entity["position"])),true)
	motion.position=controller.camera.unproject_position(Vector3(9,start.y,6));root.push_input(motion,true);_mouse(motion.position,false);await _idle()
	_check(main._session.current()["projectPath"]==revision,"A light cannot attach over the authored floor/ceiling aperture")
	await _light_settings(true,800,2700);entity=_item(id)
	_check(entity["light"]["temperatureKelvin"]==2700 and not style._sources[id].visible,"Light settings persist while plan lighting stays disabled")
	_key(KEY_F2);await _idle()
	_check(not style.plan and style._sun.visible and style._sources[id].visible,"Walkthrough must restore sun and explicit light sources")
	for marker in markers:_check(not marker.visible,"Plan-only bands must disappear completely in walkthrough")
	main._set_daylight(1)
	var player=main._world.get_node("Player")
	player.position=Vector3(entity["position"][0],.41,entity["position"][2]+1.2);player.rotation.y=0
	var camera:Camera3D=player.get_node("Camera3D");camera.look_at(controller._vec3(entity["position"]),Vector3.UP);player._pitch=camera.rotation.x;await _frames(30)
	_key(KEY_F);await process_frame
	_check(main._adjustment.active and controller.selected_id==id,"First-person ray input must select the actual ceiling light")
	var y:float=controller._preview.y;_key(KEY_RIGHT);_key(KEY_UP)
	_check(is_equal_approx(controller._preview.y,y),"First-person light micro-adjustment cannot move vertically")
	_check(style._sources[id].position.is_equal_approx(controller._preview+controller._vec3(entity["light"]["localPosition"])),"The real light source must follow a pending lamp pose")
	_key(KEY_F);await _idle();entity=_item(id)
	_check(is_equal_approx(entity["position"][1],y),"Committed first-person movement must remain ceiling-mounted")
	player.position=Vector3(entity["position"][0],.41,entity["position"][2]+1.1);camera.look_at(Vector3(entity["position"][0],.405,entity["position"][2]),Vector3.UP);player._pitch=camera.rotation.x;await _frames(30)
	var warm:Color=await _floor_color(entity);await _capture("night-warm")
	# L while adjusting uses the selected lamp, even with the view aimed at its floor pool.
	controller.begin_adjust(id);main._adjustment.active=true
	await _light_settings(false,800,2700)
	var off:Color=await _floor_color(entity);await _capture("night-off")
	controller.begin_adjust(id);main._adjustment.active=true
	await _light_settings(true,800,6500)
	var cool:Color=await _floor_color(entity);await _capture("night-cool")
	if DisplayServer.get_name()!="headless":
		print("Actual floor illumination warm=",warm," off=",off," cool=",cool)
		_check(warm.r+warm.g+warm.b>off.r+off.g+off.b+.015,"Enabled lamp must illuminate real scene surfaces, not just its mesh")
		_check(cool.b>off.b+.005 and absf(cool.b-warm.b)>.003,"Colour temperature must visibly change illumination")
	for mode in [2,3,0]:
		_key(KEY_T);await _frames(3)
		_check(main._daylight==mode and main._world.get_node("HUD/ViewControls/Daylight").selected==mode,"T must select sunrise, sunset and day through the visible native control")
		await _capture(["day","night","sunrise","sunset"][mode])
	_key(KEY_F2);await _idle()
	_check(not style._sun.visible and not style._sources[id].visible and not style._environment.ssao_enabled,"Returning to plan must remove all natural and fixture lighting again")
	_check(main._world.get_instance_id()==world_id,"Lighting/mode/layout changes must retain the running world")
	_check(FileAccess.get_sha256(main._session.current()["runtimePath"].get_basename()+".architecture.glb")==architecture,"Furniture lights must never be baked into architecture GLB")
	var saved:=directory.path_join("lit.project.json")
	_check(main._session.save_project(saved)==OK and main._session.export_runtime(directory.path_join("lit.scene.zip"))==OK,"Light settings and attached poses must save/export")
	main._open_project(saved);await _idle()
	_check(_item(id)["light"]["temperatureKelvin"]==6500 and _item(id)["movement"]["kind"]=="ceiling","Native save/reopen must retain the light and attachment")
	for kind in ["recessed_light","pendant_light","chandelier"]:
		main._edit_layout({"type":"replace","floorId":_item(id)["floorId"],"id":id,"asset":{"catalogId":kind}});await _idle()
		entity=_item(id)
		_check(main._furniture_models.has(id) and main._furniture_models[id].get_meta("p2w_asset_ref")=="builtin:"+kind+"-v1","Every ceiling fixture type must import its packaged GLB")
		_check(is_equal_approx(entity["position"][1]+entity["size"][1]/2,entity["movement"]["elevation"]),"Replacement fixtures must remain flush to the same ceiling")
		var source=main._world.get_node("ViewStyle")._sources[id]
		_check(source is SpotLight3D if kind=="recessed_light" else source is OmniLight3D,"Runtime light kind must follow the explicit compiler contract")
		if source is SpotLight3D:_check((source.basis*Vector3.FORWARD).is_equal_approx(Vector3.DOWN),"The recessed beam must consume the emitted downward source direction")
	_check(FileAccess.get_sha256(args[0])==original,"Lighting tests must leave the original native Project unchanged")
	main.free();paused=false
	print("Native flat plan / opening markers / ceiling layer / mounted controls / light settings / natural presets: ","PASS" if failures==0 else "FAIL")
	quit(0 if failures==0 else 1)
