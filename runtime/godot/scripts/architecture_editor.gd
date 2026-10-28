extends Window

const UI:=preload("res://scripts/runtime_ui.gd")
const SESSION:=preload("res://scripts/layout_session.gd")
const CANVAS:=preload("res://scripts/architecture_canvas.gd")
signal project_ready(path:String)
var session
var canvas
var _source_path:=""
var _floor:Dictionary={}
var _kind:=""
var _id:=""
var _floors:OptionButton
var _wall_selector:OptionButton
var _host_selector:OptionButton
var _tabs:TabContainer
var _items:OptionButton
var _fields:Dictionary={}
var _door_type:OptionButton
var _hinge:OptionButton
var _flip:CheckButton
var _side:OptionButton
var _entrance_selector:OptionButton
var _entrance_status:Label
var _message:Label
var _issues:ItemList
var _apply:Button
var _save:FileDialog
var _buttons:Array=[]
var _discard:ConfirmationDialog
var _pending_discard:Callable
var _wall_permission:CheckButton
var _marked_permission:CheckButton

func _ready() -> void:
	name="ArchitectureEditor";title="Correct walls and openings";theme=UI.theme();min_size=Vector2i(980,620);size=Vector2i(1120,740);process_mode=Node.PROCESS_MODE_ALWAYS;transient=true;exclusive=true
	hide()
	session=SESSION.new();add_child(session)
	var paper:=ColorRect.new();paper.color=UI.PAPER;paper.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);paper.mouse_filter=Control.MOUSE_FILTER_IGNORE;add_child(paper)
	var root:=VBoxContainer.new();root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);root.add_theme_constant_override("separation",8);add_child(root)
	var bar:=HBoxContainer.new();root.add_child(bar)
	_floors=OptionButton.new();_floors.name="CorrectionFloor";bar.add_child(_floors);_floors.item_selected.connect(_choose_floor)
	bar.add_child(UI.button("Fit plan","FitCorrectionPlan",func():canvas.fit_plan()))
	bar.add_child(UI.button("Choose entrance…","ChooseCorrectionEntrance",func():_tabs.current_tab=3))
	bar.add_child(UI.button("Draw wall","DrawCorrectionWall",func():_tabs.current_tab=0;canvas.drawing=true;_message.text="Click the two wall endpoints. Wheel zooms; middle button pans."))
	bar.add_child(UI.button("Save Project…","SaveCorrectionProject",func():_save.popup_centered_ratio(.8)))
	_apply=UI.button("Apply to space","ApplyCorrectedProject",func():hide();project_ready.emit(session.current()["projectPath"]),true);bar.add_child(_apply)
	var body:=HBoxContainer.new();body.size_flags_vertical=Control.SIZE_EXPAND_FILL;root.add_child(body)
	canvas=CANVAS.new();canvas.name="CorrectionCanvas";canvas.size_flags_horizontal=Control.SIZE_EXPAND_FILL;canvas.size_flags_vertical=Control.SIZE_EXPAND_FILL;body.add_child(canvas)
	canvas.selected.connect(_select)
	canvas.wall_drawn.connect(func(a:Dictionary,b:Dictionary):_command({"type":"wall-add","start":a,"end":b,"thickness":_fields["thickness"].value,"height":_fields["height"].value}))
	canvas.wall_modified.connect(func(id:String,a:Dictionary,b:Dictionary):_command({"type":"wall-update","id":id,"start":a,"end":b,"thickness":_fields["thickness"].value,"height":_fields["height"].value}))
	var scroll:=ScrollContainer.new();scroll.custom_minimum_size.x=330;scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;body.add_child(scroll)
	_tabs=TabContainer.new();_tabs.name="CorrectionTabs";_tabs.use_hidden_tabs_for_min_size=false;_tabs.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(_tabs)
	var panel:=VBoxContainer.new();panel.name="Walls";_tabs.add_child(panel)
	panel.add_child(UI.label("Wall correction is an advanced action.",13,UI.MUTED))
	_wall_permission=CheckButton.new();_wall_permission.name="EnableWallCorrection";_wall_permission.text="Enable wall correction";panel.add_child(_wall_permission)
	_marked_permission=CheckButton.new();_marked_permission.name="EnableMarkedWallCorrection";_marked_permission.text="Also allow marked walls";panel.add_child(_marked_permission)
	for permission in [_wall_permission,_marked_permission]:permission.toggled.connect(func(_v:bool):canvas.walls_enabled=_wall_permission.button_pressed;canvas.marked_walls_enabled=_marked_permission.button_pressed;_selection_controls();canvas.queue_redraw())
	var openings:=VBoxContainer.new();openings.name="Openings";_tabs.add_child(openings)
	var notes:=VBoxContainer.new();notes.name="Notes";_tabs.add_child(notes)
	var start:=VBoxContainer.new();start.name="Start";_tabs.add_child(start)
	start.add_child(UI.label("Choose where walkthrough begins",18))
	_entrance_status=UI.label("",13);_entrance_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;start.add_child(_entrance_status)
	start.add_child(UI.label("Main door",13));_entrance_selector=OptionButton.new();_entrance_selector.name="CorrectionMainDoor";start.add_child(_entrance_selector)
	_entrance_selector.item_selected.connect(func(_i:int):_preview_entrance())
	_side=OptionButton.new();_side.name="CorrectionEntranceSide";_side.add_item("Inward arrow · left");_side.add_item("Inward arrow · right");start.add_child(_side)
	_side.item_selected.connect(func(_i:int):_preview_entrance())
	var hint:=UI.label("Click the main door on the plan and point the amber arrow into the home. Preview first; confirm to save this entrance.",13,UI.MUTED);hint.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;start.add_child(hint)
	_add_button(start,"Confirm entrance","SetCorrectionEntrance",func():
		if _entrance_selector.selected>0:_command({"type":"set-entrance","id":_entrance_selector.get_selected_metadata(),"side":"left" if _side.selected==0 else "right"}))
	_add_button(start,"Cancel entrance preview","CancelCorrectionEntrance",_sync_entrance)
	panel.add_child(UI.label("Wall segments",18));_wall_selector=OptionButton.new();_wall_selector.name="CorrectionWall";panel.add_child(_wall_selector)
	_wall_selector.item_selected.connect(func(i:int):_select("wall",_floor["walls"][i]["id"]))
	_spin_fields(panel,[["start_x","Start X"],["start_y","Start Y"],["end_x","End X"],["end_y","End Y"],["thickness","Thickness"],["height","Wall height"],["split","Split at %"]])
	_spin_fields(openings,[["position","Opening at %"],["width","Opening width"],["opening_height","Opening height"]])
	_fields["thickness"].value=15;_fields["height"].value=280;_fields["split"].value=50;_fields["position"].value=50;_fields["width"].value=90;_fields["opening_height"].value=210
	_add_button(panel,"Apply wall","ApplyWallCorrection",func():
		if _kind=="wall":_command({"type":"wall-update","id":_id,"start":{"x":_fields["start_x"].value,"y":_fields["start_y"].value},"end":{"x":_fields["end_x"].value,"y":_fields["end_y"].value},"thickness":_fields["thickness"].value,"height":_fields["height"].value}))
	_add_button(panel,"Split selected wall","SplitCorrectionWall",func():if _kind=="wall":_command({"type":"wall-split","id":_id,"at":_fields["split"].value/100}))
	_add_button(panel,"Remove selected wall","RemoveCorrectionWall",func():if _kind=="wall":_command({"type":"wall-remove","id":_id}))
	openings.add_child(UI.label("Doors and windows",18));_items=OptionButton.new();_items.name="CorrectionOpening";openings.add_child(_items)
	_items.item_selected.connect(func(i:int):_select("opening",_floor["openings"][i]["id"]))
	openings.add_child(UI.label("Wall carrying this opening",13));_host_selector=OptionButton.new();_host_selector.name="CorrectionHostWall";openings.add_child(_host_selector)
	_door_type=OptionButton.new();_door_type.name="CorrectionDoorMotion";openings.add_child(_door_type)
	for item in [["Hinged · one leaf","single"],["Hinged · two leaves","double"],["Sliding","sliding"],["Passage · no leaf","opening"]]:_door_type.add_item(item[0]);_door_type.set_item_metadata(_door_type.item_count-1,item[1])
	_hinge=OptionButton.new();_hinge.name="CorrectionHinge";_hinge.add_item("Hinge / travel · wall start");_hinge.add_item("Hinge / travel · wall end");openings.add_child(_hinge)
	_flip=CheckButton.new();_flip.name="CorrectionSwingSide";_flip.text="Open to the other side";openings.add_child(_flip)
	_add_button(openings,"Add door on chosen wall","AddCorrectionDoor",func():_add_opening("door"))
	_add_button(openings,"Add window on chosen wall","AddCorrectionWindow",func():_add_opening("window"))
	_add_button(openings,"Apply opening / host wall","ApplyOpeningCorrection",_apply_opening)
	_add_button(openings,"Preview selected door as entrance…","PreviewCorrectionEntrance",func():
		for i in range(1,_entrance_selector.item_count):
			if _entrance_selector.get_item_metadata(i)==_id:_entrance_selector.select(i);_tabs.current_tab=3;_preview_entrance();break)
	_add_button(openings,"Remove selected item","RemoveCorrectionItem",func():
		if _kind in ["opening","furniture"]:_command({"type":"opening-remove" if _kind=="opening" else "remove","id":_id}))
	notes.add_child(UI.label("Source review notes",18));_issues=ItemList.new();_issues.name="CorrectionIssues";_issues.custom_minimum_size.y=230;notes.add_child(_issues)
	_issues.item_selected.connect(func(i:int):_select("issue",_floor["issues"][i]["id"]))
	_add_button(notes,"Mark selected note reviewed","ResolveCorrectionIssue",func():if _kind=="issue":_command({"type":"resolve-architecture-issue","id":_id,"resolved":true}))
	_message=UI.label("",13);_message.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;_message.custom_minimum_size.y=42;root.add_child(_message)
	_save=FileDialog.new();_save.name="SaveCorrectedProject";_save.access=FileDialog.ACCESS_FILESYSTEM;_save.file_mode=FileDialog.FILE_MODE_SAVE_FILE;_save.filters=PackedStringArray(["*.json ; Editable Project"]);_save.use_native_dialog=true;add_child(_save)
	_save.file_selected.connect(func(path:String):_message.text="Project saved." if session.save_project(path)==OK else "Could not save the Project.")
	_discard=ConfirmationDialog.new();_discard.dialog_text="Discard the unsaved correction session and open another Project?";_discard.confirmed.connect(func():_pending_discard.call());add_child(_discard)
	close_requested.connect(hide)
	_tabs.tab_changed.connect(func(index:int):
		canvas.entrance_picking=index==3;canvas.drawing=false;canvas._draft_start=null
		if index!=3 and not _floor.is_empty():_sync_entrance())

func _add_button(parent:Node,label:String,node_name:String,action:Callable) -> void:
	var button:=UI.button(label,node_name,action);parent.add_child(button);_buttons.append(button)

func _spin_fields(parent:Node,entries:Array) -> void:
	var grid:=GridContainer.new();grid.columns=2;parent.add_child(grid)
	for entry in entries:
		grid.add_child(UI.label(entry[1],13));var spin:=SpinBox.new();spin.name="Correction_"+entry[0];spin.min_value=-1000000;spin.max_value=1000000;spin.step=0;spin.custom_arrow_step=1;spin.size_flags_horizontal=Control.SIZE_EXPAND_FILL;grid.add_child(spin);_fields[entry[0]]=spin

func show_project(path:String) -> void:
	popup_centered_ratio(.9)
	if path==_source_path and not session.current().is_empty():return
	if session.is_dirty():confirm_discard(_load_project.bind(path),"Discard the unsaved correction session and open another Project?");return
	_load_project(path)

func confirm_discard(action:Callable,message:String) -> void:
	_pending_discard=action;_discard.dialog_text=message
	if not visible:popup_centered_ratio(.9)
	_discard.popup_centered()

func discard_session() -> void:
	hide();session.clear();_source_path="";_floor={};_kind="";_id=""
	canvas.floor={};canvas.selected_id="";canvas.queue_redraw()

func _load_project(path:String) -> void:
	_wall_permission.set_pressed_no_signal(false);_marked_permission.set_pressed_no_signal(false);canvas.walls_enabled=false;canvas.marked_walls_enabled=false
	_set_busy(true);var result:Dictionary=await session.open_plan_project(path);_set_busy(false)
	if not result.get("ok",false):_message.text=result["error"];return
	session.accept(result,true);_source_path=path;_kind="";_id="";_refresh()
	if not session.current()["editor"]["floors"].any(func(f):return f.get("entrance")!=null or f.get("walkthroughStart")!=null):_tabs.current_tab=3
	elif _floor["issues"].any(func(issue):return not issue["resolved"]):_tabs.current_tab=2

func _set_busy(value:bool) -> void:
	canvas.mouse_filter=Control.MOUSE_FILTER_IGNORE if value else Control.MOUSE_FILTER_STOP
	_lock_controls(self,value)
	if not value:_selection_controls()
	_apply.disabled=value or not session.current().get("walkthroughReady",false)

func _lock_controls(node:Node,value:bool) -> void:
	if node is FileDialog:return
	if node is BaseButton:node.disabled=value
	if node is SpinBox:node.editable=not value
	for child in node.get_children():_lock_controls(child,value)

func _selection_controls() -> void:
	var marked:=false
	for wall in _floor.get("walls",[]):
		if wall["id"]==_id:marked=wall.get("authorModified",false)
	for name in ["ApplyWallCorrection","SplitCorrectionWall","RemoveCorrectionWall"]:find_child(name,true,false).disabled=_kind!="wall" or not _wall_permission.button_pressed or (marked and not _marked_permission.button_pressed)
	find_child("DrawCorrectionWall",true,false).disabled=not _wall_permission.button_pressed
	find_child("ApplyOpeningCorrection",true,false).disabled=_kind!="opening"
	find_child("SetCorrectionEntrance",true,false).disabled=_entrance_selector.selected<=0
	find_child("PreviewCorrectionEntrance",true,false).disabled=not _floor.get("openings",[]).any(func(o):return o["id"]==_id and o["kind"]=="door" and o["type"]!="opening")
	find_child("ResolveCorrectionIssue",true,false).disabled=_kind!="issue"
	find_child("RemoveCorrectionItem",true,false).disabled=not _kind in ["opening","furniture"]

func _refresh() -> void:
	var index:=maxi(0,_floors.selected);_floors.clear()
	for floor in session.current()["editor"]["floors"]:_floors.add_item(floor["name"])
	_floors.select(mini(index,_floors.item_count-1));_choose_floor(_floors.selected)
	_apply.disabled=not session.current().get("walkthroughReady",false)
	_message.text="Plan saved in the editing session. Review source notes; save a Project backup before closing." if session.current().get("walkthroughReady",false) else "Continue correcting the plan. "+str(session.current().get("runtimeError",""))

func _choose_floor(index:int) -> void:
	var tab:=_tabs.current_tab
	_floor=session.current()["editor"]["floors"][index];_wall_selector.clear();_host_selector.clear();_items.clear();_issues.clear()
	for wall in _floor["walls"]:_wall_selector.add_item(wall["id"]+(" · corrected / protected" if wall.get("authorModified",false) else ""));_host_selector.add_item(wall["id"])
	for opening in _floor["openings"]:_items.add_item(opening["id"]+" · "+opening["kind"])
	for issue in _floor["issues"]:_issues.add_item(("✓ " if issue["resolved"] else "! ")+issue["message"]);_issues.set_item_tooltip(_issues.item_count-1,issue["message"])
	canvas.configure(_floor,_id)
	_sync_entrance()
	if _kind.is_empty() and not _floor["issues"].is_empty():_tabs.current_tab=2
	if _kind=="wall" and _floor["walls"].any(func(w):return w["id"]==_id):_select(_kind,_id)
	elif _kind=="opening" and _floor["openings"].any(func(o):return o["id"]==_id):_select(_kind,_id)
	elif _kind=="issue" and _floor["issues"].any(func(i):return i["id"]==_id):_select(_kind,_id)
	elif not _floor["walls"].is_empty():_select("wall",_floor["walls"][0]["id"])
	_tabs.current_tab=tab
	if tab==3:_sync_entrance()

func _sync_entrance() -> void:
	_entrance_selector.clear();_entrance_selector.add_item("Choose an existing door…");_entrance_selector.set_item_metadata(0,"")
	var entrance=_floor.get("entrance")
	for opening in _floor.get("openings",[]):
		if opening["kind"]!="door" or opening["type"]=="opening":continue
		_entrance_selector.add_item(opening["id"]);_entrance_selector.set_item_metadata(_entrance_selector.item_count-1,opening["id"])
		if entrance is Dictionary and entrance["doorId"]==opening["id"]:_entrance_selector.select(_entrance_selector.item_count-1)
	_side.select(1 if entrance is Dictionary and entrance["side"]=="right" else 0)
	_entrance_status.text="Confirmed entrance: "+str(entrance["doorId"])+". The green arrow shows the saved inward side." if entrance is Dictionary else "No main door chosen on this floor. Choose the actual entrance and its inward arrow."
	if _floor.get("walkthroughStart")!=null and entrance==null:_entrance_status.text="This floor has an explicitly saved start. Confirming a main door will replace that start."
	canvas.entrance_preview={};canvas.queue_redraw();_selection_controls()

func _preview_entrance() -> void:
	canvas.entrance_preview={} if _entrance_selector.selected<=0 else {"doorId":_entrance_selector.get_selected_metadata(),"side":"left" if _side.selected==0 else "right"}
	canvas.queue_redraw();_selection_controls()

func _select(kind:String,id:String) -> void:
	_kind=kind;_id=id;canvas.selected_id=id;canvas.queue_redraw()
	_selection_controls()
	if kind=="wall":
		_tabs.current_tab=0
		for i in range(_floor["walls"].size()):
			var w:Dictionary=_floor["walls"][i]
			if w["id"]!=id:continue
			_wall_selector.select(i);_host_selector.select(i)
			for key in ["start","end"]:
				_fields[key+"_x"].value=w[key]["x"];_fields[key+"_y"].value=w[key]["y"]
			_fields["thickness"].value=w["thickness"];_fields["height"].value=w["height"]
	elif kind=="opening":
		var preparing_entrance:=_tabs.current_tab==3
		if not preparing_entrance:_tabs.current_tab=1
		for i in range(_floor["openings"].size()):
			var o:Dictionary=_floor["openings"][i]
			if o["id"]!=id:continue
			_items.select(i);_fields["position"].value=o["position"]*100;_fields["width"].value=o["width"];_fields["opening_height"].value=o["height"]
			for wi in range(_floor["walls"].size()):
				if _floor["walls"][wi]["id"]==o["wallId"]:_host_selector.select(wi)
			if o["kind"]=="door":
				_hinge.select(0 if o["swingDirection"]=="right" else 1);_flip.set_pressed_no_signal(o["flipSide"])
				var found:=false
				for ti in range(_door_type.item_count):
					if _door_type.get_item_metadata(ti)==o["type"]:_door_type.select(ti);found=true
				if not found:_door_type.add_item("Keep existing motion");_door_type.set_item_metadata(_door_type.item_count-1,o["type"]);_door_type.select(_door_type.item_count-1)
			_hinge.disabled=o["kind"]!="door";_flip.disabled=o["kind"]!="door";_door_type.disabled=o["kind"]!="door"
		if preparing_entrance:
			for i in range(1,_entrance_selector.item_count):
				if _entrance_selector.get_item_metadata(i)==id:_entrance_selector.select(i);_preview_entrance();break
	elif kind=="issue":
		_tabs.current_tab=2
		for i in range(_floor["issues"].size()):
			if _floor["issues"][i]["id"]==id:_issues.select(i);_message.text=_floor["issues"][i]["message"]

func _add_opening(kind:String) -> void:
	if _host_selector.selected<0:return
	_command({"type":"opening-add","wallId":_floor["walls"][_host_selector.selected]["id"],"position":_fields["position"].value/100,"width":_fields["width"].value,"kind":kind,"doorType":_door_type.get_selected_metadata()})

func _apply_opening() -> void:
	if _kind!="opening" or _host_selector.selected<0:return
	var position:float=_fields["position"].value/100
	for opening in _floor["openings"]:
		if opening["id"]==_id and _fields["position"].value==opening["position"]*100:position=opening["position"]
	_command({"type":"opening-update","id":_id,"wallId":_floor["walls"][_host_selector.selected]["id"],"position":position,"width":_fields["width"].value,"height":_fields["opening_height"].value,"doorType":_door_type.get_selected_metadata(),"swingDirection":"right" if _hinge.selected==0 else "left","flipSide":_flip.button_pressed})

func _command(command:Dictionary) -> void:
	if session.busy or _floor.is_empty():return
	if str(command["type"]).begins_with("wall-"):
		if not _wall_permission.button_pressed:_message.text="Enable advanced wall correction first.";return
		command["confirmWallEdit"]=_marked_permission.button_pressed
	command["floorId"]=_floor["id"];_set_busy(true)
	var result:Dictionary=await session.apply_plan_command(command);_set_busy(false)
	if not result.get("ok",false):_message.text=result["error"];canvas.configure(_floor,_id);return
	session.accept(result)
	if result.get("selectedId")!=null:_id=str(result["selectedId"])
	else:_id="";_kind=""
	if command["type"]=="wall-add":_kind="wall"
	if command["type"]=="opening-add":_kind="opening"
	if command["type"]=="set-entrance":_kind="opening"
	_refresh()
