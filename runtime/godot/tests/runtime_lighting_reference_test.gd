extends SceneTree
const MAIN:=preload("res://main.tscn")
var main
var failures:=0
func _initialize():run.call_deferred()
func check(value:bool,text:String):
	if not value:failures+=1;push_error(text)
func idle():
	while main._session.busy or main._editing or (main._layout_camera!=null and main._layout_camera.transitioning):await process_frame;OS.delay_msec(2)
	for i in range(5):await physics_frame
func run():
	var args:=OS.get_cmdline_user_args();if args.size()!=2:quit(2);return
	DirAccess.make_dir_recursive_absolute(args[1]);main=MAIN.instantiate();root.add_child(main);await process_frame
	main._open_project(args[0]);await idle()
	if main._world==null or not main._furniture_models.has("reference-marker"):
		check(false,"Fixed reference must load completely before rendering");main.free();quit(1);return
	main._show_walkthrough();await idle()
	for pair in [["reference-art","wall_art"],["reference-mirror","mirror"]]:
		check(main._furniture_models.has(pair[0]) and main._furniture_models[pair[0]].get_meta("p2w_asset_ref","")=="builtin:"+pair[1]+"-v1","Common wall decoration must load its real packaged asset")
		check(main._collider_nodes.has("furniture:"+pair[0]),"Mounted decoration must retain independent compiler collision")
	check(not main._furniture_models["reference-marker"].has_meta("p2w_asset_ref"),"Unreplaced semantic source must remain a placeholder")
	var style=main._world.get_node("ViewStyle");var player=main._world.get_node("Player");var camera:Camera3D=player.get_node("Camera3D")
	player.position=Vector3(3,.02,5.2);player.velocity=Vector3.ZERO;camera.look_at(Vector3(3,.7,2.5),Vector3.UP);player._pitch=camera.rotation.x;player.set_physics_process(false)
	var evidence:Array=[]
	for mode in range(4):
		main._set_daylight(mode)
		for i in range(5):await process_frame
		var row:Dictionary={"mode":mode,"sun":style._sun.light_energy,"ambient":style._environment.ambient_light_energy,"exposure":style._environment.tonemap_exposure}
		if DisplayServer.get_name()!="headless":
			await RenderingServer.frame_post_draw;var image:=root.get_texture().get_image()
			image.save_png(str(args[1]).path_join(["day","night","sunrise","sunset"][mode]+".png"))
			var total:=0;var clipped:=0;var sum:=0.0
			for y in range(180,image.get_height()-130,3):
				for x in range(340,image.get_width()-50,3):
					var color:=image.get_pixel(x,y);total+=1;sum+=(color.r+color.g+color.b)/3
					if color.r>=.98 and color.g>=.98 and color.b>=.98:clipped+=1
			row["averageRgb"]=sum/maxi(total,1);row["clippedFraction"]=float(clipped)/maxi(total,1)
			check(row["clippedFraction"]<.01,"Fixed reference must retain highlight detail in every preset")
		evidence.append(row)
	if DisplayServer.get_name()!="headless":
		check(evidence[0]["averageRgb"]>evidence[1]["averageRgb"]+.1,"Day must remain visibly brighter than night")
		main._set_daylight(0);player.position=Vector3(3,.02,.8);camera.look_at(Vector3(3,1.5,5.8),Vector3.UP);player._pitch=camera.rotation.x
		for i in range(5):await process_frame
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(str(args[1]).path_join("wall-decor.png"))
	var original_mode:int=main._daylight
	main._view_mode=main.ViewMode.PLAN;main._resume();await idle();check(style.plan and not style._sun.visible,"Plan must disable calibrated natural light")
	main._show_walkthrough();await idle();check(main._daylight==original_mode and style._sun.visible,"Returning from plan must restore the selected natural preset")
	var saved:=str(args[1]).path_join("reference.saved.project.json");check(main._session.save_project(saved)==OK,"Reference must save through the native session")
	var file:=FileAccess.open(str(args[1]).path_join("lighting-measurements.json"),FileAccess.WRITE);file.store_string(JSON.stringify({"scope":"fixed authored camera; actual ROI pixels only when displayed; no source-fidelity or Windows GPU claim","clipThreshold":.01,"presets":evidence},"\t"));file.close()
	main._session._dirty=false;main.free();await process_frame
	print("Fixed lighting reference / four presets / plan restoration: ","PASS" if failures==0 else "FAIL");quit(0 if failures==0 else 1)
