extends CanvasLayer

const UI := preload("res://scripts/runtime_ui.gd")
const TASK := preload("res://scripts/authoring_task.gd")
const PREVIEW := preload("res://scripts/source_plan_preview.gd")
signal project_ready(path: String)
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

func _ready() -> void:
	name="DesktopAuthoring";layer=20;process_mode=Node.PROCESS_MODE_ALWAYS
	_task=TASK.new();add_child(_task)
	_task.progress.connect(func(message: String):_status.text=message)
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
	_pick=UI.button("Choose floor-plan image…","ChooseImage",func():get_node("SourcePicker").popup_centered_ratio(.8));create.add_child(_pick)
	_source_name=_text("PNG / JPEG / WebP · up to 12 MB / 24 million pixels",14);create.add_child(_source_name)
	_preview=PREVIEW.new();_preview.name="SourcePreview";_preview.custom_minimum_size=Vector2(0,220);_preview.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	_preview.resized.connect(func():_preview.queue_redraw());create.add_child(_preview)
	_scale=LineEdit.new();_scale.name="ScaleHint";_scale.placeholder_text="Optional known measurement, e.g. lower wall = 600 cm";create.add_child(_scale)
	_consent=CheckBox.new();_consent.name="ConfirmPaidRequests";_consent.text="Send this image for two observations using my OpenRouter credits."
	_consent.toggled.connect(func(_value):_sync());create.add_child(_consent)
	_generate=UI.button("Reconstruct floor plan","ReconstructImage",_generate_project,true);create.add_child(_generate)
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
	help.add_child(_text("1. Connect OpenRouter and select a vision model.\n2. Choose the original image and confirm the two paid observations.\n3. Review counts/assumptions and explicitly select the main entrance and inward side. Save the native Project as a backup.\n4. Open arrangement. Tab browses furniture; drag moves it; R rotates; X swaps. F2 switches orthographic arrangement / first-person walkthrough.\n5. Layout → Save saves the Project; Export writes the derived runtime scene ZIP. There is no Undo/history."))
	help.add_child(_text("No account is needed to open existing Projects/scenes. New reconstruction sends the original image to OpenRouter and the selected model provider. Failed/cancelled requests can still cost credits; there is no automatic paid retry. For structural corrections use the internal authoring editor.",14))
	_status=_text("",14);column.add_child(_status)
	_cancel=UI.button("Cancel current AI task","CancelAITask",func():_task.cancel());column.add_child(_cancel)
	var fit:=func():panel.custom_minimum_size=Vector2(minf(720,_screen.size.x-48),minf(720,_screen.size.y-48))
	_screen.resized.connect(func():fit.call_deferred());column.minimum_size_changed.connect(func():fit.call_deferred())
	var picker:=FileDialog.new();picker.name="SourcePicker";picker.title="Choose original floor-plan image";picker.access=FileDialog.ACCESS_FILESYSTEM;picker.file_mode=FileDialog.FILE_MODE_OPEN_FILE
	picker.filters=PackedStringArray(["*.png,*.jpg,*.jpeg,*.webp ; Floor-plan images"]);picker.use_native_dialog=true;picker.file_selected.connect(_select_source);add_child(picker)
	_save=FileDialog.new();_save.name="ProjectBackup";_save.access=FileDialog.ACCESS_FILESYSTEM;_save.file_mode=FileDialog.FILE_MODE_SAVE_FILE;_save.filters=PackedStringArray(["*.json ; Native Project"]);_save.use_native_dialog=true
	_save.file_selected.connect(_save_backup)
	add_child(_save)
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
		_models.select(-1);_model.clear()
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
	_model.editable=not busy;_key.editable=not busy;_scale.editable=not busy;_consent.disabled=busy
	for index in range(_models.item_count):_models.set_item_disabled(index,busy)
	for choice in [_entrance,_side]:
		for index in range(choice.item_count):choice.set_item_disabled(index,busy)
	_preview.mouse_filter=Control.MOUSE_FILTER_IGNORE if busy else Control.MOUSE_FILTER_STOP
	_generate.disabled=busy or _api_key.is_empty() or _model.text.strip_edges().is_empty() or _source_path.is_empty() or not _consent.button_pressed
	_open.disabled=busy or _result.is_empty() or _entrance.selected<1
	_backup.disabled=busy or _result.is_empty()

func _select_source(path:String) -> void:
	if _task.busy:return
	var file:=FileAccess.open(path,FileAccess.READ)
	if file==null or file.get_length()>12*1024*1024:_status.text="Choose a readable image up to 12 MB.";return
	var image:=Image.load_from_file(path)
	if image==null or image.is_empty() or image.get_width()*image.get_height()>24000000:_status.text="Choose an image up to 24 million pixels.";return
	image.convert(Image.FORMAT_RGBA8)
	_source_path=path;_source_image=image;_source_name.text=path.get_file();_result={};_entrance.clear()
	_preview.texture=ImageTexture.create_from_image(image);_preview.doors=[];_preview.selected=-1;_preview.queue_redraw()
	_consent.button_pressed=false;_summary.text="Review the original image, scale hint and selected model before generating.";_sync()

func _generate_project() -> void:
	if _generate.disabled:return
	if _session_dir.is_empty():
		_session_dir=ProjectSettings.globalize_path("user://creation-sessions/%s-%s" % [OS.get_process_id(),Time.get_ticks_usec()]);DirAccess.make_dir_recursive_absolute(_session_dir)
	_attempt+=1
	var stem:=_session_dir.path_join(str(_attempt));var raster:=stem+".rgba"
	var file:=FileAccess.open(raster,FileAccess.WRITE)
	if file==null:_status.text="Could not prepare original image pixels.";return
	file.store_buffer(_source_image.get_data());file.close()
	_sync(true);_status.text="Starting reconstruction…"
	var result:Dictionary=await _task.run({"op":"reconstruct","apiKey":_api_key,"model":_model.text.strip_edges(),"imagePath":_source_path,"rasterPath":raster,"width":_source_image.get_width(),"height":_source_image.get_height(),"scaleHint":_scale.text,"outputDirectory":stem})
	DirAccess.remove_absolute(raster);_consent.button_pressed=false
	if result.get("ok",false):
		_result=result;_entrance.clear();_entrance.add_item("Choose the main entrance…");_preview.doors=[];_preview.selected=-1
		var floor:Dictionary=result["floors"][0]
		_preview.doors=floor["doors"]
		for index in range(floor["doors"].size()):_entrance.add_item("%d · %s" % [index+1,floor["doors"][index]["label"]])
		_preview.queue_redraw()
		_summary.text="%s · %d walls / %d furniture markers\nAssumptions: %s" % [result["name"],floor["wallCount"],floor["furnitureCount"],"; ".join(result["assumptions"])]
		_status.text="Reconstruction ready. Review it and choose an entrance. Reported model cost: %s" % ("not provided" if result["cost"]==null else "$"+str(result["cost"]))
	else:_status.text=result["error"]
	_sync()

func _open_result() -> void:
	if _open.disabled:return
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
