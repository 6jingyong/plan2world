extends SceneTree

const MAIN:=preload("res://main.tscn")
var main
var directory:=""
var failures:=0
var checks:Array=[]
var phase:=""
var checkpoint_paths:Array=[]
func _initialize():run.call_deferred()
func check(ok:bool,message:String):
	checks.append({"pass":ok,"check":message})
	if ok:print("PASS reconstruction resume: ",message)
	else:failures+=1;push_error(message)
func settled():
	var deadline:=Time.get_ticks_msec()+45000
	while Time.get_ticks_msec()<deadline:
		await process_frame;OS.delay_msec(2)
		if main._authoring._task.busy or main._session.busy or main._editing:continue
		for i in range(4):await process_frame
		if not main._authoring._task.busy and not main._session.busy and not main._editing:return
	check(false,"Native task settled before wall-clock deadline")
func captured()->Array:
	var file:=directory.path_join("requests.json")
	return JSON.parse_string(FileAccess.get_file_as_string(file)) if FileAccess.file_exists(file) else []
func screenshot(name:String):
	if DisplayServer.get_name()=="headless":return
	var target:Control=main._authoring._usage_summary if name=="resumed-token-usage" else main._authoring._resume_task
	var scroll=main._authoring._tabs.get_parent()
	if scroll is ScrollContainer:scroll.ensure_control_visible(target)
	for i in range(3):await process_frame
	await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(directory.path_join(name+".png"))
func connect_account(view):
	view._tabs.current_tab=0;view._key.text="fixture-resume-key";view._connect.pressed.emit();await settled();view._tabs.current_tab=1
func run():
	var args:=OS.get_cmdline_user_args();directory=args[1];phase=args[2];DirAccess.make_dir_recursive_absolute(directory)
	root.size=Vector2i(1280,900);root.gui_embed_subwindows=true
	if DisplayServer.get_name()=="headless":root.content_scale_size=root.size;root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var deadline:=Time.get_ticks_msec()+150000
	process_frame.connect(func():if Time.get_ticks_msec()>deadline:push_error("Reconstruction lifecycle timeout");quit(1))
	var preloader:=directory.path_join("resume-provider.cjs")
	if phase=="prepare":
		var file:=FileAccess.open(preloader,FileAccess.WRITE)
		file.store_string("const directory="+JSON.stringify(directory)+";\n")
		file.store_string("""
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const evidence={decision:'accept',decisionBasis:'Synthetic source.',evidence:'Synthetic stroke.'};
const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'measured_dimension',realLengthCm:360,endpoints:[{x:0,y:0},{x:360,y:0}],evidence:'360cm'},walls:[[[0,0],[360,0]],[[360,0],[360,300]],[[360,300],[0,300]],[[0,300],[0,0]]].map(([a,b],i)=>({...evidence,label:'w'+i,start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]}})),openings:[{...evidence,label:'entry',kind:'door',endpoints:[{x:135,y:0},{x:225,y:0}]}],doorGaps:[]};
global.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://openrouter.ai/api/v1/'))throw new Error('Unexpected provider');
 const json=v=>new Response(JSON.stringify(v));
 if(url.endsWith('/key'))return json({data:{usage:0,limit_remaining:1}});
 if(url.endsWith('/models'))return json({data:[{id:'fixture/vision',name:'Fixture',architecture:{input_modalities:['image'],output_modalities:['text']}}]});
 if(!url.endsWith('/chat/completions'))throw new Error('Unexpected endpoint');
 const body=JSON.parse(init.body),prompt=body.messages[0].content[1].text;
 const file=path.join(directory,'requests.json'),records=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
 records.push({phase:prompt.includes('FROZEN_ARCHITECTURE_JSON:')?'furnishing':'architecture',imageSha256:crypto.createHash('sha256').update(Buffer.from(body.messages[0].content[0].image_url.url.split(',')[1],'base64')).digest('hex')});fs.writeFileSync(file+'.tmp',JSON.stringify(records));fs.renameSync(file+'.tmp',file);
 const delay=path.join(directory,'delay-next');if(fs.existsSync(delay)){fs.unlinkSync(delay);await new Promise(r=>setTimeout(r,60000));}
 const failure=path.join(directory,'fail-furniture');
 if(prompt.includes('FROZEN_ARCHITECTURE_JSON:')&&fs.existsSync(failure)){fs.unlinkSync(failure);return new Response('private provider body',{status:503});}
 return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(prompt.includes('FROZEN_ARCHITECTURE_JSON:')?{schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:{x:180,y:150}}]}:architecture)}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:40},completion_tokens_details:{reasoning_tokens:5},cost:.002}});
};
""")
		file.close();file=FileAccess.open(directory.path_join("fail-furniture"),FileAccess.WRITE);file.close()
	var previous_options:=OS.get_environment("NODE_OPTIONS");OS.set_environment("NODE_OPTIONS","--require "+JSON.stringify(preloader))
	main=MAIN.instantiate();root.add_child(main);await process_frame
	check(await main._open_project(args[0]),"Existing world opens before reconstruction")
	await settled();var world:int=main._world.get_instance_id();var input_sha:=FileAccess.get_sha256(args[0])
	main._show_menu();var view=main._authoring;view.show_page(1)
	if phase=="prepare":
		await connect_account(view);view._model.text="fixture/vision"
		var image:=Image.create(360,300,false,Image.FORMAT_RGBA8);image.fill(Color.WHITE);var image_path:=directory.path_join("original.png");image.save_png(image_path)
		view.get_node("SourcePicker").file_selected.emit(image_path);await settled();view._scale.text="360 cm";view._consent.button_pressed=true
		check(not view._generate.disabled,"First generation requires explicit two-request consent")
		view._generate.pressed.emit();await settled()
		check(view._result.is_empty() and view._checkpoint_info.get("remainingRequests")==1 and captured().size()==2,"Furniture failure preserves architecture and offers exactly one missing request")
		check(view._resume_task.disabled and not view._consent.button_pressed and view._status.text.contains("HTTP 503") and not view._status.text.contains("private provider body"),"Failure resets consent, redacts provider body and does not retry")
		check(view._usage_summary.text.contains("input: 100") and view._usage_summary.text.contains("cached subset: 40") and view._usage_summary.text.contains("not provided"),"Real IPC displays reported token subsets and unknown failed-request cost")
		var checkpoint:String=view._checkpoint_path
		checkpoint_paths.append(checkpoint)
		var record:={"checkpointPath":checkpoint,"architectureSha256":FileAccess.get_sha256(checkpoint.get_base_dir().path_join("source-architecture.json")),"processId":OS.get_process_id()}
		var file:=FileAccess.open(directory.path_join("prepared.json"),FileAccess.WRITE);file.store_string(JSON.stringify(record));file.close()
		await screenshot("failure-one-request-left")
	else:
		var record:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(directory.path_join("prepared.json")))
		checkpoint_paths.append(record["checkpointPath"])
		check(int(record["processId"])!=OS.get_process_id() and view._api_key.is_empty(),"A genuinely new application process starts without the previous credential")
		view._restore.pressed.emit();await settled()
		check(view._checkpoint_path==record["checkpointPath"] and view._checkpoint_info.get("remainingRequests")==1 and captured().size()==2,"Restore last task validates frozen evidence offline after process restart")
		check(view._resume_task.disabled,"Missing observation cannot run without reconnecting and consent")
		await connect_account(view)
		check(view._model.text=="fixture/vision" and view._resume_task.disabled,"Reconnection retains the explicitly restored model and still requires consent")
		view._consent.button_pressed=true;view._resume_task.pressed.emit();await settled()
		check(not view._result.is_empty() and captured().size()==3 and view._result.get("cost")==.002,"Continuing requests only furniture and reports only this attempt's new cost")
		check(view._result.get("usage",{}).get("requestsStarted")==1 and FileAccess.get_sha256(view._result["projectPath"].get_base_dir().path_join("source-architecture.json"))==record["architectureSha256"],"Reused architecture is byte-identical and is not charged as a new request")
		await screenshot("resumed-token-usage")
		var complete_checkpoint:String=view._checkpoint_path
		checkpoint_paths.append(complete_checkpoint)
		view._disconnect.pressed.emit();view.get_node("CheckpointPicker").file_selected.emit(complete_checkpoint);await settled()
		check(view._checkpoint_info.get("remainingRequests")==0 and not view._resume_task.disabled and not view._consent.visible,"Complete observations can be reassembled offline without account or paid consent")
		view._resume_task.pressed.emit();await settled()
		check(not view._result.is_empty() and captured().size()==3 and view._result.get("cost")==0,"Offline assembly makes zero new provider requests")
		checkpoint_paths.append(view._checkpoint_path)
		var native:=FileAccess.get_file_as_string(view._result["projectPath"])
		check(not native.contains("fixture-resume-key") and not native.contains("checkpointPath") and not native.contains("inputTokens"),"Canonical Project excludes credentials, checkpoints and usage transport")
		# Cancellation after a real mocked request starts must retain its checkpoint.
		view._new_task.pressed.emit();await connect_account(view);view._model.text="fixture/vision"
		view.get_node("SourcePicker").file_selected.emit(directory.path_join("original.png"));await settled()
		var file:=FileAccess.open(directory.path_join("delay-next"),FileAccess.WRITE);file.close();view._consent.button_pressed=true;view._generate.pressed.emit()
		var request_deadline:=Time.get_ticks_msec()+30000
		while captured().size()<4 and Time.get_ticks_msec()<request_deadline:await process_frame;OS.delay_msec(2)
		check(view._task.busy and captured().size()==4,"A request starts before explicit cancellation")
		view._cancel.pressed.emit();await settled()
		check(view._status.text.contains("cancelled") and view._checkpoint_info.get("remainingRequests")==2 and not view._checkpoint_path.is_empty(),"Cancelling the child process retains a verifiable task for later explicit continuation")
		check(view._usage_summary.text.contains("not provided") and view._resume_task.disabled and captured().size()==4,"Interrupted billing remains unknown and no automatic retry occurs")
		checkpoint_paths.append(view._checkpoint_path)
		await screenshot("cancelled-task-retained")
	check(main._world.get_instance_id()==world and FileAccess.get_sha256(args[0])==input_sha,"All recognition and recovery steps retain the active world and original native input")
	var report:={"phase":phase,"processId":OS.get_process_id(),"checks":checks,"failures":failures,"providerRequestsTotal":captured().size(),"checkpointPaths":checkpoint_paths,"scope":"Exact native authoring core/IPC with mocked provider. No paid call or image-extraction-quality claim."}
	var report_file:=FileAccess.open(directory.path_join(phase+"-report.json"),FileAccess.WRITE);report_file.store_string(JSON.stringify(report,"  "));report_file.close()
	main.free();paused=false
	if previous_options.is_empty():OS.unset_environment("NODE_OPTIONS")
	else:OS.set_environment("NODE_OPTIONS",previous_options)
	quit(0 if failures==0 else 1)
