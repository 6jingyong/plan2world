extends CanvasLayer

const UI := preload("res://scripts/runtime_ui.gd")
const TASK := preload("res://scripts/authoring_task.gd")
const PREVIEW := preload("res://scripts/source_plan_preview.gd")
signal project_ready(path: String)
signal correction_ready(path:String)
var _screen: Control
var _task
var _api_key := ""
var _status: Label
var _account_status: Label
var _key: LineEdit
var _model: LineEdit
var _models: OptionButton
var _tabs: TabContainer
var _preview
var _source_path := ""
var _source_image: Image
var _source_name: Label
var _scale: LineEdit
var _consent: CheckBox
var _generate: Button
var _open: Button
var _backup: Button
var _entrance: OptionButton
var _side: OptionButton
var _summary: Label
var _result: Dictionary={}
var _session_dir := ""
var _attempt := 0
var _connect: Button
var _login: Button
var _disconnect: Button
var _pick: Button
var _cancel: Button
var _save: FileDialog
var _input_preview
var _perspective: CheckBox
var _proportion: OptionButton
var _reference_width: SpinBox
var _reference_height: SpinBox
var _output_width: SpinBox
var _prepare_image: Button
var _accept_image: Button
var _rotate_image: Button
var _quarter_turns := 0
var _source_raster := ""
var _input_count := 0
var _pending_input: Dictionary={}
var _accepted_input: Dictionary={}
var _checkpoint_path:=""
var _checkpoint_info:Dictionary={}
var _last_task_path:=""
var _restore:Button
var _browse_task:Button
var _resume_task:Button
var _new_task:Button
var _usage_summary:Label
var _checkpoint_label:Label

func _ready() -> void:
	name="DesktopAuthoring";layer=20;process_mode=Node.PROCESS_MODE_ALWAYS
	_task=TASK.new();add_child(_task)
	_task.progress.connect(func(message: String):_status.text=message)
	_task.checkpoint_ready.connect(_remember_checkpoint)
	_task.usage_reported.connect(_show_usage)
	_task.authorization_requested.connect(func(url: String):
		if not url.begins_with("https://openrouter.ai/auth?"):return
		if OS.shell_open(url)!=OK: _task.cancel("Could not open the system browser. Use your API key instead."))
	_screen=Control.new();UI.fill(_screen);_screen.theme=UI.theme();add_child(_screen)
	var background:=ColorRect.new();background.color=Color("e4ecdf");UI.fill(background);_screen.add_child(background)
	var center:=CenterContainer.new();UI.fill(center);_screen.add_child(center)
	var panel:=PanelContainer.new();center.add_child(panel)
	var column:=VBoxContainer.new();panel.add_child(column)
	var heading:=HBoxContainer.new();column.add_child(heading)
	var title:=UI.label("Create your space",26);title.size_flags_horizontal=Control.SIZE_EXPAND_FILL;heading.add_child(title)
	heading.add_child(UI.button("Back","CloseAuthoring",func():
		_task.cancel();_screen.hide()))
	var scroll:=ScrollContainer.new();scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL;column.add_child(scroll)
	_tabs=TabContainer.new();_tabs.size_flags_horizontal=Control.SIZE_EXPAND_FILL;_tabs.use_hidden_tabs_for_min_size=false;scroll.add_child(_tabs)
	var account:=VBoxContainer.new();account.name="AI account";_tabs.add_child(account)
	account.add_child(_text("Connect your own OpenRouter account. Only image reconstruction uses credits; walkthrough and furniture layout work offline."))
	_account_status=_text("Not connected · credentials are kept for this session only.");account.add_child(_account_status)
	_login=UI.button("Continue with OpenRouter","LoginOpenRouter",func():_account_action({"op":"login"}),true);account.add_child(_login)
	account.add_child(_text("Or connect an existing API key:",14))
	_key=LineEdit.new();_key.name="OpenRouterKey";_key.secret=true;_key.placeholder_text="OpenRouter API key";account.add_child(_key)
	_connect=UI.button("Connect API key","ConnectOpenRouter",func():
		var key:=_key.text;_key.clear();_account_action({"op":"connect","apiKey":key}));account.add_child(_connect)
	_disconnect=UI.button("Disconnect","DisconnectOpenRouter",_disconnect_account);account.add_child(_disconnect)
	account.add_child(UI.button("Manage OpenRouter keys…","ManageOpenRouterKeys",func():OS.shell_open("https://openrouter.ai/keys")))
	account.add_child(_text("Vision model (choose from your provider or enter its exact ID):",14))
	_models=OptionButton.new();_models.name="VisionModels";_models.fit_to_longest_item=false
	_models.item_selected.connect(func(index:int):_model.text=_models.get_item_metadata(index);_sync())
	account.add_child(_models)
	_model=LineEdit.new();_model.name="VisionModel";_model.placeholder_text="Select a vision model";_model.text_changed.connect(func(_text):_sync());account.add_child(_model)
	account.add_child(_text("ChatGPT account: use the reconstruction Skill in your ChatGPT/Codex host. This desktop version connects to OpenRouter; it does not reuse your ChatGPT browser session.",14))
	var create:=VBoxContainer.new();create.name="From an image";_tabs.add_child(create)
	var saved_actions:=HBoxContainer.new();create.add_child(saved_actions)
	_browse_task=UI.button("Choose saved task…","ChooseSavedTask",func():get_node("CheckpointPicker").popup_centered_ratio(.8));saved_actions.add_child(_browse_task)
	_restore=UI.button("Restore last task","RestoreLastTask",func():_load_checkpoint(_last_task_path));saved_actions.add_child(_restore)
	_checkpoint_label=_text("",14);create.add_child(_checkpoint_label)
	_pick=UI.button("Choose floor-plan image…","ChooseImage",func():get_node("SourcePicker").popup_centered_ratio(.8));create.add_child(_pick)
	_source_name=_text("PNG / JPEG / WebP · up to 12 MB / 24 million pixels",14);create.add_child(_source_name)
	_perspective=CheckBox.new();_perspective.name="CorrectPerspective";_perspective.text="Correct a photographed rectangle"
	_perspective.toggled.connect(func(value:bool):_input_preview.visible=value;_invalidate_input());create.add_child(_perspective)
	create.add_child(_text("For a photo, select paper or a known rectangle. Keep dimension labels; do not square off the apartment outline. Flat images can be used directly.",14))
	_input_preview=PREVIEW.new();_input_preview.name="PaperCorners";_input_preview.editing_corners=true;_input_preview.custom_minimum_size=Vector2(0,220);_input_preview.size_flags_horizontal=Control.SIZE_EXPAND_FILL;_input_preview.hide()
	_input_preview.focus_mode=Control.FOCUS_ALL
	_input_preview.corners_changed.connect(func(_points:Array):_invalidate_input());create.add_child(_input_preview)
	var dimensions:=GridContainer.new();dimensions.columns=2;create.add_child(dimensions)
	dimensions.add_child(_text("Known rectangle proportion",14));_proportion=OptionButton.new();_proportion.name="PaperProportion"
	for label in ["Choose a known proportion…","A4 portrait · 210:297","A4 landscape · 297:210","Custom width / height"]:_proportion.add_item(label)
	_proportion.item_selected.connect(func(index:int):
		if index==1:_reference_width.set_value_no_signal(210);_reference_height.set_value_no_signal(297)
		elif index==2:_reference_width.set_value_no_signal(297);_reference_height.set_value_no_signal(210)
		else:_reference_width.set_value_no_signal(0);_reference_height.set_value_no_signal(0)
		_invalidate_input());dimensions.add_child(_proportion)
	for label in ["Reference width","Reference height","Output width (px)"]:
		dimensions.add_child(_text(label,14));var spin:=SpinBox.new();spin.min_value=0;spin.max_value=100000;spin.step=.01;dimensions.add_child(spin)
		spin.value_changed.connect(func(_value:float):_invalidate_input())
		if label=="Reference width":_reference_width=spin;spin.name="ReferenceWidth"
		elif label=="Reference height":_reference_height=spin;spin.name="ReferenceHeight"
		else:_output_width=spin;spin.name="PreparedWidth";spin.min_value=2;spin.max_value=6000;spin.step=1;spin.set_value_no_signal(1600)
	_perspective.toggled.connect(func(value:bool):dimensions.visible=value);dimensions.hide()
	create.add_child(_text("Reference sides use the same units and establish image proportion only, not the building's physical scale.",14))
	var image_actions:=HBoxContainer.new();create.add_child(image_actions)
	_rotate_image=UI.button("Rotate output 90°","RotatePreparedImage",func():_quarter_turns=(_quarter_turns+1)%4;_invalidate_input());image_actions.add_child(_rotate_image)
	_prepare_image=UI.button("Preview prepared image","PrepareImage",_prepare_input);image_actions.add_child(_prepare_image)
	_accept_image=UI.button("Use prepared image","ConfirmPreparedImage",func():_accepted_input=_pending_input.duplicate(true);_consent.button_pressed=false;_status.text="Prepared image confirmed. No AI request has been sent.";_sync(),true);create.add_child(_accept_image)
	_preview=PREVIEW.new();_preview.name="SourcePreview";_preview.custom_minimum_size=Vector2(0,220);_preview.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	_preview.resized.connect(func():_preview.queue_redraw());create.add_child(_preview)
	_scale=LineEdit.new();_scale.name="ScaleHint";_scale.placeholder_text="Optional known measurement, e.g. lower wall = 600 cm";create.add_child(_scale)
	_scale.text_changed.connect(func(_value:String):if not _checkpoint_path.is_empty():_consent.button_pressed=false;_sync())
	_consent=CheckBox.new();_consent.name="ConfirmPaidRequests";_consent.text="Send this image for two observations using my OpenRouter credits."
	_consent.toggled.connect(func(_value):_sync());create.add_child(_consent)
	_generate=UI.button("Reconstruct floor plan","ReconstructImage",_generate_project,true);create.add_child(_generate)
	_resume_task=UI.button("Continue saved task","ResumeReconstruction",_resume_project,true);create.add_child(_resume_task)
	_new_task=UI.button("Start a new task","StartNewReconstruction",_start_new_task);create.add_child(_new_task)
	_usage_summary=_text("",14);_usage_summary.name="ObservationUsage";create.add_child(_usage_summary)
	_summary=_text("Review the result before opening it. The model observes; shared code assembles the Project.",14);create.add_child(_summary)
	_entrance=OptionButton.new();_entrance.name="MainEntrance";_entrance.fit_to_longest_item=false
	_entrance.item_selected.connect(func(index:int):_preview.selected=index-1;_preview.queue_redraw();_sync());create.add_child(_entrance)
	_preview.door_selected.connect(func(index:int):_entrance.select(index+1);_entrance.item_selected.emit(index+1))
	_side=OptionButton.new();_side.name="EntranceSide";_side.add_item("Inward · left of authored wall direction");_side.add_item("Inward · right of authored wall direction")
	_side.item_selected.connect(func(index:int):_preview.side=1 if index==0 else -1;_preview.queue_redraw());create.add_child(_side)
	create.add_child(_text("Click a numbered door in the source image, then choose the arrow pointing indoors. Invalid or blocked starts are rejected; the app never guesses another entrance.",14))
	_open=UI.button("Open arrangement","OpenGeneratedProject",_open_result,true);create.add_child(_open)
	_backup=UI.button("Save native Project…","SaveGeneratedProject",func():_save.popup_centered_ratio(.8));create.add_child(_backup)
	var help:=VBoxContainer.new();help.name="How to use";_tabs.add_child(help)
	help.add_child(_text("Plugin / Skill",23))
	help.add_child(_text("In a host with reconstruct-plan2world installed, attach the original floor-plan image and invoke the Skill. Review the draft and native Project in the authoring tool. Export a runtime scene, then open it here; or choose Arrange a Project to edit furniture. AI usage belongs to your host account."))
	help.add_child(_text("Standalone desktop",23))
	help.add_child(_text("1. Choose the image. Flat plans work directly; for photos, select the paper/known rectangle, enter its true proportion, preview and confirm. Preparation is local and free.\n2. Connect OpenRouter, choose a model and explicitly confirm two paid observations of that prepared image.\n3. Review counts/assumptions and explicitly select the main entrance and inward side. Save the native Project as a backup.\n4. Open arrangement. Tab browses furniture; drag moves it; R rotates; X swaps. F2 switches orthographic arrangement / first-person walkthrough.\n5. Layout → Save saves the Project; Export writes the derived runtime scene ZIP. There is no Undo/history."))
	help.add_child(_text("No account is needed for image preparation or existing Projects/scenes. Recognition sends the confirmed image to OpenRouter and the selected model provider. Failed/cancelled requests can still cost credits; there is no automatic paid retry. For structural corrections use the internal authoring editor.",14))
	_status=_text("",14);column.add_child(_status)
	_cancel=UI.button("Cancel current task","CancelAITask",func():_task.cancel());column.add_child(_cancel)
	var fit:=func():panel.custom_minimum_size=Vector2(minf(720,_screen.size.x-48),minf(720,_screen.size.y-48))
	_screen.resized.connect(func():fit.call_deferred());column.minimum_size_changed.connect(func():fit.call_deferred())
	var picker:=FileDialog.new();picker.name="SourcePicker";picker.title="Choose original floor-plan image";picker.access=FileDialog.ACCESS_FILESYSTEM;picker.file_mode=FileDialog.FILE_MODE_OPEN_FILE
	picker.filters=PackedStringArray(["*.png,*.jpg,*.jpeg,*.webp ; Floor-plan images"]);picker.use_native_dialog=true;picker.file_selected.connect(_select_source);add_child(picker)
	_save=FileDialog.new();_save.name="ProjectBackup";_save.access=FileDialog.ACCESS_FILESYSTEM;_save.file_mode=FileDialog.FILE_MODE_SAVE_FILE;_save.filters=PackedStringArray(["*.json ; Native Project"]);_save.use_native_dialog=true
	_save.file_selected.connect(_save_backup)
	add_child(_save)
	var checkpoints:=FileDialog.new();checkpoints.name="CheckpointPicker";checkpoints.title="Choose a saved reconstruction checkpoint.json";checkpoints.access=FileDialog.ACCESS_FILESYSTEM;checkpoints.file_mode=FileDialog.FILE_MODE_OPEN_FILE;checkpoints.filters=PackedStringArray(["*.json ; Saved reconstruction"]);checkpoints.use_native_dialog=true;checkpoints.file_selected.connect(_load_checkpoint);add_child(checkpoints)
	var previous:=ConfigFile.new()
	if previous.load("user://last-reconstruction.cfg")==OK:_last_task_path=str(previous.get_value("task","path",""))
	var saved_root:=ProjectSettings.globalize_path("user://creation-sessions")
	if DirAccess.dir_exists_absolute(saved_root):checkpoints.current_dir=saved_root
	_screen.hide();_sync();fit.call_deferred()

func _text(value:String,size:=16) -> Label:
	var label:=UI.label(value,size);label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;label.custom_minimum_size.x=300
	return label

func show_page(page:=0) -> void:
	_screen.show();_tabs.current_tab=page;_sync()

func _account_action(request:Dictionary) -> void:
	_status.text="Connecting to OpenRouter…";_sync(true)
	var result:Dictionary=await _task.run(request);request.clear()
	if result.get("ok",false):
		_api_key=result["apiKey"];result.erase("apiKey");_models.clear()
		for model in result["models"]:
			_models.add_item(model["name"]);_models.set_item_metadata(_models.item_count-1,model["id"])
		_models.select(-1);_model.text=_checkpoint_info.get("input",{}).get("model","")
		_account_status.text="OpenRouter connected · session only\nAt connection: key usage $%s · key budget remaining %s" % [result["usage"],"unspecified" if result["remaining"]==null else "$"+str(result["remaining"])]
		_status.text="Choose a vision model, then open From an image."
	else:_status.text=result["error"]
	_sync()

func _disconnect_account() -> void:
	_api_key="";_key.clear();_model.clear();_models.clear();_account_status.text="Disconnected. No credential was saved.";_sync()

func _sync(working:=false) -> void:
	var busy:bool=working or _task.busy
	_cancel.disabled=not busy
	for button in [_login,_connect,_disconnect,_pick]:button.disabled=busy
	_restore.disabled=busy;_restore.visible=not _last_task_path.is_empty();_browse_task.disabled=busy;_new_task.disabled=busy
	_perspective.disabled=busy or _source_path.is_empty()
	for spin in [_reference_width,_reference_height,_output_width]:spin.editable=not busy
	for index in range(_proportion.item_count):_proportion.set_item_disabled(index,busy)
	_prepare_image.disabled=busy or _source_path.is_empty();_rotate_image.disabled=_prepare_image.disabled
	_rotate_image.text="Rotate output 90° · %d°" % (_quarter_turns*90)
	_accept_image.visible=not _pending_input.is_empty() and _accepted_input.is_empty();_accept_image.disabled=busy
	_input_preview.mouse_filter=Control.MOUSE_FILTER_IGNORE if busy else Control.MOUSE_FILTER_STOP
	_model.editable=not busy;_key.editable=not busy;_scale.editable=not busy;_consent.disabled=busy
	for index in range(_models.item_count):_models.set_item_disabled(index,busy)
	for choice in [_entrance,_side]:
		for index in range(choice.item_count):choice.set_item_disabled(index,busy)
	_preview.mouse_filter=Control.MOUSE_FILTER_IGNORE if busy else Control.MOUSE_FILTER_STOP
	var saved:=not _checkpoint_path.is_empty()
	var remaining:int=_checkpoint_info.get("remainingRequests",2)
	var binding:Dictionary=_checkpoint_info.get("input",{})
	var matching:bool=not binding.is_empty() and _model.text.strip_edges()==binding.get("model") and _scale.text==binding.get("scaleHint")
	_generate.disabled=busy or saved or _api_key.is_empty() or _model.text.strip_edges().is_empty() or _accepted_input.is_empty() or not _consent.button_pressed
	_resume_task.visible=saved and _result.is_empty();_new_task.visible=saved;_checkpoint_label.visible=saved
	_resume_task.text="Rebuild from saved observations · no requests" if remaining==0 else "Continue saved task · %d request(s)" % remaining
	_resume_task.disabled=busy or not matching or (remaining>0 and (_api_key.is_empty() or not _consent.button_pressed))
	_consent.visible=not saved or remaining>0
	_consent.text="Send this image for two observations using my OpenRouter credits." if not saved else "Send only the %d missing observation(s) using my OpenRouter credits." % remaining
	_checkpoint_label.text="Saved observations available. Continue uses the same image, model and scale hint." if matching else "A saved task is retained. Restore it to continue, or start a new task after changing inputs."
	_open.disabled=busy or _result.is_empty() or (not _result.get("correction",false) and _entrance.selected<1)
	_open.text="Correct annotated plan…" if _result.get("correction",false) else "Open arrangement"
	_backup.disabled=busy or _result.is_empty()

func _select_source(path:String) -> void:
	if _task.busy:return
	var file:=FileAccess.open(path,FileAccess.READ)
	if file==null or file.get_length()>12*1024*1024:_status.text="Choose a readable image up to 12 MB.";return
	var image:=Image.load_from_file(path)
	if image==null or image.is_empty() or image.get_width()*image.get_height()>24000000:_status.text="Choose an image up to 24 million pixels.";return
	_clear_checkpoint();image.convert(Image.FORMAT_RGBA8);_ensure_creation_session();_input_count+=1
	var raster:=_session_dir.path_join("decoded-%d.rgba" % _input_count)
	file=FileAccess.open(raster,FileAccess.WRITE)
	if file==null:_status.text="Could not prepare image pixels.";return
	file.store_buffer(image.get_data());file.close();_sync(true);_status.text="Preparing image locally…"
	var result:Dictionary=await _task.run({"op":"prepare-image","imagePath":path,"rasterPath":raster,"width":image.get_width(),"height":image.get_height(),"pixelOrientation":"raw","recipe":{"mode":"identity","quarterTurns":0},"outputDirectory":_session_dir.path_join("input-%d" % _input_count)})
	DirAccess.remove_absolute(raster)
	if not result.get("ok",false):_status.text=result["error"];_sync();return
	_source_path=result["originalPath"];_source_raster=result["sourceRasterPath"];_source_name.text=path.get_file();_source_image=Image.load_from_file(result["imagePath"])
	_quarter_turns=0;_perspective.set_pressed_no_signal(false);_perspective.toggled.emit(false);_input_preview.corners=[Vector2.ZERO,Vector2(1,0),Vector2.ONE,Vector2(0,1)];_input_preview.texture=ImageTexture.create_from_image(_source_image)
	_output_width.set_value_no_signal(mini(2048,int(result["sourceWidth"])));_pending_input=result;_accepted_input=result.duplicate(true)
	_set_input_preview(result);_consent.button_pressed=false;_status.text="Review the image and model before generating. Photo correction is local and uses no AI credits.";_sync()

func _ensure_creation_session() -> void:
	if not _session_dir.is_empty():return
	_session_dir=ProjectSettings.globalize_path("user://creation-sessions/%s-%s" % [OS.get_process_id(),Time.get_ticks_usec()]);DirAccess.make_dir_recursive_absolute(_session_dir)

func _invalidate_input() -> void:
	if _preview==null or _consent==null:return
	_clear_checkpoint();_pending_input={};_accepted_input={};_result={};_entrance.clear();_preview.doors=[];_preview.selected=-1;_preview.queue_redraw();_consent.button_pressed=false;_sync()
	_summary.text="Input changed. Preview and confirm it before recognition."

func _set_input_preview(result:Dictionary) -> void:
	_preview.texture=ImageTexture.create_from_image(Image.load_from_file(result["imagePath"]));_preview.doors=[];_preview.selected=-1;_preview.queue_redraw();_result={};_entrance.clear()
	_summary.text="%d × %d · original photo and transform retained. Check proportions and dimension labels before recognition." % [result["width"],result["height"]]

func _prepare_input() -> void:
	if _prepare_image.disabled:return
	var recipe:Dictionary={"mode":"perspective" if _perspective.button_pressed else "identity","quarterTurns":_quarter_turns}
	if _perspective.button_pressed:
		if _reference_width.value<=0 or _reference_height.value<=0:_status.text="Choose a known rectangle width and height.";return
		var corners:Array=[]
		for point in _input_preview.corners:corners.append({"x":point.x,"y":point.y})
		recipe.merge({"corners":corners,"aspectRatio":_reference_width.value/_reference_height.value,"outputWidth":int(_output_width.value)})
	_input_count+=1;_sync(true);_status.text="Correcting image locally…"
	var result:Dictionary=await _task.run({"op":"prepare-image","imagePath":_source_path,"sourceName":_source_name.text,"rasterPath":_source_raster,"width":_source_image.get_width(),"height":_source_image.get_height(),"pixelOrientation":"upright","recipe":recipe,"outputDirectory":_session_dir.path_join("input-%d" % _input_count)})
	if result.get("ok",false):_pending_input=result;_accepted_input={};_set_input_preview(result);_status.text="Check the prepared image, then choose Use prepared image. No AI request has been sent."
	else:_status.text=result["error"]
	_sync()

func _generate_project() -> void:
	if _generate.disabled:return
	_ensure_creation_session()
	_attempt+=1
	var stem:=_session_dir.path_join("run-%d" % _attempt)
	_sync(true);_status.text="Starting reconstruction…"
	var result:Dictionary=await _task.run({"op":"reconstruct","apiKey":_api_key,"model":_model.text.strip_edges(),"imagePath":_accepted_input["imagePath"],"rasterPath":_accepted_input["rasterPath"],"width":_accepted_input["width"],"height":_accepted_input["height"],"preparationManifestPath":_accepted_input["manifestPath"],"originalImagePath":_accepted_input["originalPath"],"scaleHint":_scale.text,"outputDirectory":stem})
	await _finish_reconstruction(result)

func _finish_reconstruction(result:Dictionary) -> void:
	_consent.button_pressed=false
	if result.get("usage") is Dictionary:_show_usage(result["usage"])
	if result.get("ok",false):
		_result=result;_entrance.clear();_entrance.add_item("Choose the main entrance…");_preview.doors=[];_preview.selected=-1
		_checkpoint_info={"remainingRequests":0,"input":{"model":_model.text.strip_edges(),"scaleHint":_scale.text}}
		var floor:Dictionary=result["floors"][0]
		_preview.doors=floor["doors"]
		for index in range(floor["doors"].size()):_entrance.add_item("%d · %s" % [index+1,floor["doors"][index]["label"]])
		_preview.queue_redraw()
		_summary.text="%s · %d walls / %d furniture markers\nAssumptions: %s" % [result["name"],floor["wallCount"],floor["furnitureCount"],"; ".join(result["assumptions"])]
		_status.text=("%d source review notes. Open the correction plan to edit walls and openings. " % result["issueCount"] if result.get("correction",false) else "Reconstruction ready. Review it and choose an entrance. ")+"Reported cost this attempt: "+("not provided" if result["cost"]==null else "$"+str(result["cost"]))
	else:
		var failure:String=result["error"]
		if result.get("checkpointPath") is String:await _load_checkpoint(result["checkpointPath"])
		_status.text=failure
	_sync()

func _remember_checkpoint(path:String) -> void:
	_checkpoint_path=path;_last_task_path=path
	var config:=ConfigFile.new();config.set_value("task","path",path)
	if config.save("user://last-reconstruction.cfg.tmp")==OK:DirAccess.rename_absolute(ProjectSettings.globalize_path("user://last-reconstruction.cfg.tmp"),ProjectSettings.globalize_path("user://last-reconstruction.cfg"))

func _clear_checkpoint() -> void:
	_checkpoint_path="";_checkpoint_info={}
	if _consent!=null:_consent.button_pressed=false
	if _usage_summary!=null:_usage_summary.text=""

func _start_new_task() -> void:
	_clear_checkpoint();_source_path="";_source_raster="";_pending_input={};_accepted_input={};_result={}
	_preview.texture=null;_preview.doors=[];_preview.selected=-1;_preview.queue_redraw();_entrance.clear()
	_perspective.set_pressed_no_signal(false);_input_preview.hide();_input_preview.texture=null;_proportion.get_parent().hide()
	_source_name.text="Choose an image for the new task. Previous saved tasks are retained.";_summary.text="No request has been sent.";_sync()

func _load_checkpoint(path:String) -> void:
	if _task.busy:return
	_sync(true);_status.text="Checking saved image and observations locally…"
	var result:Dictionary=await _task.run({"op":"inspect-reconstruction","checkpointPath":path})
	if not result.get("ok",false):_status.text=result["error"];_sync();return
	_checkpoint_info=result;_remember_checkpoint(result["checkpointPath"])
	var saved:Dictionary=result["input"]
	_source_path="";_source_raster="";_pending_input={};_accepted_input={"imagePath":saved["imagePath"],"rasterPath":saved["rasterPath"],"width":saved["width"],"height":saved["height"]}
	_model.text=saved["model"];_scale.text=saved["scaleHint"];_source_name.text=saved.get("sourceName","Saved image")
	_preview.texture=ImageTexture.create_from_image(Image.load_from_file(saved["imagePath"]));_preview.doors=[];_preview.selected=-1;_preview.queue_redraw();_result={};_entrance.clear()
	_perspective.set_pressed_no_signal(false);_input_preview.hide();_proportion.get_parent().hide();_consent.button_pressed=false
	_show_usage(result["usage"]);_summary.text="Saved image and completed observations verified. %d new request(s) needed." % result["remainingRequests"]
	_status.text="Saved task ready. No request has been sent.";_sync()

func _resume_project() -> void:
	if _resume_task.disabled:return
	_ensure_creation_session();_attempt+=1;_sync(true);_status.text="Continuing the saved task…"
	var result:Dictionary=await _task.run({"op":"resume-reconstruction","checkpointPath":_checkpoint_path,"apiKey":_api_key,"model":_model.text.strip_edges(),"scaleHint":_scale.text,"outputDirectory":_session_dir.path_join("run-%d" % _attempt)})
	await _finish_reconstruction(result)

func _show_usage(summary:Dictionary) -> void:
	var lines:PackedStringArray=[]
	for entry in summary.get("stages",[]):
		var usage:Dictionary=entry.get("usage",{})
		var token_text:PackedStringArray=[]
		for metric in [["inputTokens","input"],["outputTokens","output"],["totalTokens","total"],["cachedTokens","cached subset"],["reasoningTokens","reasoning subset"]]:
			token_text.append(metric[1]+": "+("not provided" if usage.get(metric[0])==null else str(usage[metric[0]])))
		lines.append(str(entry["stage"])+" · "+str(entry["status"])+" · "+", ".join(token_text))
		lines.append("Text bytes (not tokens) · prompt: "+("not provided" if entry.get("promptBytes")==null else str(entry["promptBytes"]))+" / response: "+("not provided" if entry.get("responseBytes")==null else str(entry["responseBytes"])))
	lines.append("New requests this attempt: "+str(summary.get("requestsStarted",0))+" · reported cost: "+("not provided; started requests may still be charged" if summary.get("cost")==null else "$"+str(summary["cost"])))
	_usage_summary.text="\n".join(lines)

func _open_result() -> void:
	if _open.disabled:return
	if _result.get("correction",false):_screen.hide();correction_ready.emit(_result["projectPath"]);return
	_sync(true)
	if await _prepare_entrance():_screen.hide();project_ready.emit(_result["projectPath"])
	_sync()

func _prepare_entrance() -> bool:
	if _entrance.selected<1:return true
	var floor:Dictionary=_result["floors"][0]
	var result:Dictionary=await _task.run({"op":"entrance","projectPath":_result["projectPath"],"floorId":floor["id"],"doorId":floor["doors"][_entrance.selected-1]["id"],"side":"left" if _side.selected==0 else "right"})
	if result.get("ok",false):_result["projectPath"]=result["projectPath"];return true
	_status.text=result["error"];return false

func _save_backup(path:String) -> void:
	if _result.is_empty() or _task.busy:return
	_sync(true)
	if await _prepare_entrance():
		var temporary:=path+".p2w-%s-%s.tmp" % [OS.get_process_id(),Time.get_ticks_usec()]
		var error:Error=DirAccess.copy_absolute(_result["projectPath"],temporary)
		if error==OK:error=DirAccess.rename_absolute(temporary,path)
		if error!=OK:DirAccess.remove_absolute(temporary)
		_status.text="Native Project saved." if error==OK else "Could not save the native Project."
	_sync()

func _exit_tree() -> void:
	_api_key=""
	# Inputs/observations are local reconstruction evidence, not an edit history.
	# Keep unfinished reconstruction evidence for diagnosis; never store credentials.

func _unhandled_key_input(event:InputEvent) -> void:
	if _screen.visible and event is InputEventKey and event.pressed and event.keycode==KEY_ESCAPE:
		_task.cancel();_screen.hide();get_viewport().set_input_as_handled()
