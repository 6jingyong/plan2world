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
	var captures_path:=directory.path_join("provider-images.json")
	file.store_string("const capturePath="+JSON.stringify(captures_path)+";const captured=[];\n")
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
  captured.push(require('node:crypto').createHash('sha256').update(Buffer.from(body.messages[0].content[0].image_url.url.split(',')[1],'base64')).digest('hex'));
  require('node:fs').writeFileSync(capturePath,JSON.stringify(captured));
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
	view.get_node("SourcePicker").file_selected.emit(image_path);await _settled()
	_check(view._generate.disabled,"Image upload/inference must require explicit confirmation of paid observations")
	_check(not view._accepted_input.is_empty() and not FileAccess.file_exists(captures_path),"Flat input preparation must run locally without paid observations")
	await _click(view._perspective);await process_frame
	_check(view._accepted_input.is_empty() and not view._consent.button_pressed,"Changing input preparation must revoke previous confirmation and paid consent")
	view._proportion.select(3);view._proportion.item_selected.emit(3)
	view._reference_width.value=360;view._reference_height.value=300;view._output_width.value=360
	# Exercise actual letterboxed corner dragging, not a second homography in GD.
	var scroll=view._input_preview.get_parent().get_parent()
	while scroll!=null and not scroll is ScrollContainer:scroll=scroll.get_parent()
	if scroll!=null:scroll.ensure_control_visible(view._input_preview)
	await process_frame;await process_frame
	var paper_rect:Rect2=view._input_preview.image_rect()
	var down:=InputEventMouseButton.new();down.button_index=MOUSE_BUTTON_LEFT;down.pressed=true;down.position=view._input_preview.global_position+paper_rect.position+Vector2(2,2)
	root.push_input(down,true)
	var drag:=InputEventMouseMotion.new();drag.position=view._input_preview.global_position+paper_rect.position+paper_rect.size*Vector2(.9,.9);drag.button_mask=MOUSE_BUTTON_MASK_LEFT;root.push_input(drag,true)
	down.pressed=false;down.position=drag.position;root.push_input(down,true);await process_frame
	_check(view._input_preview.corners[0].distance_to(Vector2(.9,.9))<.01,"Native paper handles must map actual pointer positions to upright source coordinates")
	await _click(view._prepare_image);await _settled()
	_check(view._pending_input.is_empty() and view._status.text.contains("convex") and not FileAccess.file_exists(captures_path),"Crossed/concave paper selections must be rejected before paid work")
	view._input_preview.corners=[Vector2(.05,.05),Vector2(.95,.1),Vector2(.9,.95),Vector2(.1,.9)];view._input_preview.corners_changed.emit(view._input_preview.corners);view._input_preview.queue_redraw()
	await _click(view._prepare_image);await _settled()
	_check(not view._pending_input.is_empty() and view._accepted_input.is_empty() and view._generate.disabled,"A corrected preview must await explicit image confirmation")
	if scroll is ScrollContainer:scroll.ensure_control_visible(view._preview)
	await process_frame;await process_frame
	await _capture("prepared-photo")
	await _click(view._accept_image);await process_frame
	_check(not view._accepted_input.is_empty() and not view._consent.button_pressed,"Confirming a local correction must not authorize a paid request")
	await _click(view._consent);await process_frame
	_check(not view._generate.disabled,"A connected account, chosen model and image consent must enable reconstruction")
	view._scale.text="360 cm"
	await _click(view._generate);await _settled()
	_check(not view._result.is_empty() and not view._consent.button_pressed,"Exact shipped AI core must complete two mocked provider observations and reset consent")
	if view._result.is_empty():main.free();paused=false;quit(1);return
	var generated:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(view._result["projectPath"]))
	var captured:Array=JSON.parse_string(FileAccess.get_file_as_string(captures_path))
	_check(captured.size()==2 and captured[0]==FileAccess.get_sha256(view._accepted_input["imagePath"]) and captured[0]==captured[1],"Both observations must receive the exact confirmed image bytes")
	_check(generated["reconstruction"]["inputPreparation"]["manifest"]["width"]==360 and generated["reconstruction"]["inputPreparation"].has("originalDataUrl"),"Saved native evidence must retain the original photo and confirmed transform")
	_check(FileAccess.get_sha256(image_path)==FileAccess.get_sha256(view._accepted_input["originalPath"]),"Preparing a photograph must never overwrite its original bytes")
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
	# A real JPEG APP1 orientation is tested through the native decoder + shared
	# core. Phone direction and local output rotation require no AI account.
	var phone:=Image.create(96,64,false,Image.FORMAT_RGB8);phone.fill(Color.BLUE)
	for y in range(64):
		for x in range(48):phone.set_pixel(x,y,Color.RED)
	var jpeg:=phone.save_jpg_to_buffer(.95)
	var exif:=PackedByteArray([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0])
	var phone_path:=directory.path_join("phone-exif6.jpg");file=FileAccess.open(phone_path,FileAccess.WRITE);file.store_buffer(jpeg.slice(0,2)+exif+jpeg.slice(2));file.close()
	view.show_page(1);view.get_node("SourcePicker").file_selected.emit(phone_path);await _settled()
	_check(view._source_image.get_width()==64 and view._source_image.get_height()==96 and view._source_image.get_pixel(32,10).r>.8 and view._source_image.get_pixel(32,85).b>.8,"Native JPEG EXIF must normalize upright before selecting corners, without double rotation")
	await _click(view._rotate_image);await _click(view._prepare_image);await _settled()
	_check(view._pending_input.get("width",0)==96 and view._pending_input.get("height",0)==64 and view._accepted_input.is_empty(),"Manual output rotation must operate on the upright source and await confirmation")
	_check(JSON.parse_string(FileAccess.get_file_as_string(captures_path)).size()==2 and view._api_key.is_empty(),"EXIF preparation/rotation must not require an account or invoke a provider")
	view.show_page(2);await process_frame;await _capture("native-guide")
	_check(FileAccess.get_sha256(args[0])==original,"Desktop authoring must not modify the previously opened native source")
	main.free();paused=false
	if previous_options.is_empty():OS.unset_environment("NODE_OPTIONS")
	else:OS.set_environment("NODE_OPTIONS",previous_options)
	print("Native desktop account / original image / shared reconstruction / entrance / cancellation / no exported credentials (mock provider): ","PASS" if failures==0 else "FAIL")
	quit(0 if failures==0 else 1)
