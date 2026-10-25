extends SceneTree

const MAIN:=preload("res://main.tscn")
var main
var failures:=0
var directory:=""
func _initialize():_run.call_deferred()
func _check(value:bool,message:String):
	if not value:failures+=1;push_error(message)
func _settled():
	var deadline:=Time.get_ticks_msec()+30000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if not main._authoring._task.busy and not main._session.busy and not main._editing:
			await process_frame
			if main._layout_camera==null or not main._layout_camera.transitioning:return
	_check(false,"Native desktop authoring must settle within its deadline")
func _click(control:Control):
	var parent:=control.get_parent()
	while parent!=null and not parent is ScrollContainer:parent=parent.get_parent()
	if parent is ScrollContainer:
		parent.ensure_control_visible(control)
		await process_frame;await process_frame
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.position=control.get_global_rect().get_center();event.pressed=true
	root.push_input(event,true);event.pressed=false;root.push_input(event,true)
func _capture(name:String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join(name+".png"))==OK,"Native authoring capture must save")
func _run():
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,720);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var args:=OS.get_cmdline_user_args();directory=args[1];DirAccess.make_dir_recursive_absolute(directory)
	var original:=FileAccess.get_sha256(args[0])
	# Provider responses are mocked in the child Node process through Node's
	# standard test preloader. Production PCK/core/IPC stay exact and unchanged;
	# no real credential, paid call or extraction-quality claim is involved.
	var preloader:=directory.path_join("mock-openrouter.cjs")
	var file:=FileAccess.open(preloader,FileAccess.WRITE)
	file.store_string("""
const e={decision:'accept',decisionBasis:'Synthetic source.',evidence:'Synthetic source stroke.'};
const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'measured_dimension',realLengthCm:360,endpoints:[{x:0,y:0},{x:360,y:0}],evidence:'360 cm'},walls:[[[0,0],[360,0]],[[360,0],[360,300]],[[360,300],[0,300]],[[0,300],[0,0]]].map(([a,b],i)=>({...e,label:'wall'+i,start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]}})),openings:[{...e,label:'entrance',kind:'door',endpoints:[{x:135,y:0},{x:225,y:0}]}],doorGaps:[]};
global.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://openrouter.ai/api/v1/'))throw new Error('Unexpected provider');
 const json=x=>new Response(JSON.stringify(x));
 if(url.endsWith('/key')){
  if(init.headers.Authorization==='Bearer fixture-delay')await new Promise(r=>setTimeout(r,60000));
  if(init.headers.Authorization==='Bearer fixture-reject')return new Response('redacted-fixture-secret',{status:401});
  return json({data:{usage:.01,limit_remaining:4.99}});
 }
 if(url.endsWith('/models'))return json({data:[{id:'fixture/vision',name:'Test vision',architecture:{input_modalities:['image','text'],output_modalities:['text']}}]});
 if(url.endsWith('/chat/completions')){
  const body=JSON.parse(init.body),prompt=body.messages[0].content[1].text;
  return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(prompt.includes('FROZEN_ARCHITECTURE_JSON:')?{schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:{x:180,y:150}}]}:architecture)}}],usage:{cost:.002}});
 }
 throw new Error('Unexpected provider request');
};
""")
	file.close()
	var previous_options:=OS.get_environment("NODE_OPTIONS")
	OS.set_environment("NODE_OPTIONS","--require "+JSON.stringify(preloader))
	main=MAIN.instantiate();root.add_child(main);await process_frame
	main._open_project(args[0]);await _settled()
	var world_id:int=main._world.get_instance_id()
	main._show_menu();await process_frame
	await _click(main._launcher.find_child("AIAccount",true,false));await process_frame
	var view=main._authoring
	_check(view._screen.visible and paused,"AI account GUI must open natively over the paused world")
	await _capture("ai-account")
	var window_size:=root.size
	root.size=Vector2i(800,540)
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(800,540)
	for i in range(3):await process_frame
	var panel:Control=view._screen.get_child(1).get_child(0)
	_check(Rect2(Vector2.ZERO,root.get_visible_rect().size).encloses(panel.get_global_rect()),"Native account form must fit the minimum desktop window")
	await _capture("ai-account-compact")
	root.size=window_size
	if DisplayServer.get_name()=="headless":root.content_scale_size=Vector2i(1280,720)
	for i in range(3):await process_frame
	var mode:=InputEventKey.new();mode.keycode=KEY_F1;mode.pressed=true;root.push_input(mode,true)
	_check(paused and main._menu_open,"F1 behind the authoring overlay must not resume locomotion")
	view._key.text="fixture-private-key"
	await _click(view._connect);await _settled()
	_check(view._api_key=="fixture-private-key" and view._key.text.is_empty() and view._key.secret,"Successful key connection must clear the secret field and keep the credential only in memory")
	_check(view._models.item_count==1 and view._model.text.is_empty(),"Connecting must load vision models without silently choosing a paid model")
	view._models.select(0);view._models.item_selected.emit(0)
	view._key.text="fixture-reject";await _click(view._connect);await _settled()
	_check(view._api_key=="fixture-private-key" and view._status.text.contains("HTTP 401") and not view._status.text.contains("redacted-fixture-secret"),"Failed replacement login must retain the active account and redact provider bodies")
	view._tabs.current_tab=1;await process_frame
	var image:=Image.create(360,300,false,Image.FORMAT_RGBA8);image.fill(Color.WHITE)
	var image_path:=directory.path_join("synthetic-original.png");image.save_png(image_path)
	view.get_node("SourcePicker").file_selected.emit(image_path);await process_frame
	_check(view._generate.disabled,"Image upload/inference must require explicit confirmation of paid observations")
	await _click(view._consent);await process_frame
	_check(not view._generate.disabled,"A connected account, chosen model and image consent must enable reconstruction")
	view._scale.text="360 cm"
	await _click(view._generate);await _settled()
	_check(not view._result.is_empty() and not view._consent.button_pressed,"Exact shipped AI core must complete two mocked provider observations and reset consent")
	if view._result.is_empty():main.free();paused=false;quit(1);return
	var generated:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(view._result["projectPath"]))
	_check(generated["floors"][0]["walls"].size()==4 and not generated["floors"][0].has("entrance"),"Generated native data must retain observed architecture and leave entrance choice to the user")
	_check(view._open.disabled and view._preview.doors.size()==1,"Generation alone must not guess an entrance or replace the active world")
	_check(main._world.get_instance_id()==world_id,"The previous world must survive account and image generation")
	await _capture("source-review")
	var marker:Array=view._preview.doors[0]["sourcePoint"]
	var rect:Rect2=view._preview.image_rect()
	var event:=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.pressed=true;event.position=view._preview.global_position+rect.position+Vector2(marker[0],marker[1])*rect.size
	root.push_input(event,true);event.pressed=false;root.push_input(event,true);await process_frame
	_check(view._entrance.selected==1 and not view._open.disabled,"Clicking the source-image door marker must author an explicit entrance choice")
	await _capture("entrance-review")
	var backup:=directory.path_join("review-backup.project.json")
	view.get_node("ProjectBackup").file_selected.emit(backup);await _settled()
	_check(JSON.parse_string(FileAccess.get_file_as_string(backup))["floors"][0]["entrance"]=={"doorId":"d1","side":"left"},"Saving a source-review backup must retain its explicit entrance before opening the world")
	await _click(view._open);await _settled()
	_check(not view._screen.visible and main._world.get_instance_id()!=world_id and main._layout_camera.camera.projection==Camera3D.PROJECTION_ORTHOGONAL,"Accepted generated Project must open as a native orthographic arrangement")
	var saved:=directory.path_join("generated.project.json")
	_check(main._session.save_project(saved)==OK,"Generated Project must save through the canonical layout path")
	var native:=FileAccess.get_file_as_string(saved)
	_check(not native.contains("fixture-private-key") and not native.contains("apiKey"),"Canonical Project must never include provider credentials")
	_check(JSON.parse_string(native)["floors"][0]["entrance"]=={"doorId":"d1","side":"left"},"Native save must retain the explicitly chosen main door and inward side")
	main._show_menu();view.show_page(0);await process_frame
	view._key.text="fixture-delay";await _click(view._connect);await process_frame
	_check(view._task.busy,"Pending connection must remain cancellable")
	view._task.cancel();await _settled()
	_check(view._api_key=="fixture-private-key" and view._status.text.contains("cancelled"),"Cancelled child process must settle without replacing the account")
	view._key.text="fixture-delay";await _click(view._connect);await process_frame
	view._task.cancel("Could not open the system browser. Use your API key instead.");await _settled()
	_check(view._status.text=="Could not open the system browser. Use your API key instead." and view._api_key=="fixture-private-key","Actionable authorization failure must survive task completion without being replaced by generic cancellation")
	await _click(view._disconnect);await process_frame
	_check(view._api_key.is_empty() and view._generate.disabled,"Disconnect must erase the in-memory account and prevent new paid tasks")
	view.show_page(2);await process_frame;await _capture("native-guide")
	_check(FileAccess.get_sha256(args[0])==original,"Desktop authoring must not modify the previously opened native source")
	main.free();paused=false
	if previous_options.is_empty():OS.unset_environment("NODE_OPTIONS")
	else:OS.set_environment("NODE_OPTIONS",previous_options)
	print("Native desktop account / original image / shared reconstruction / entrance / cancellation / no exported credentials (mock provider): ","PASS" if failures==0 else "FAIL")
	quit(0 if failures==0 else 1)
