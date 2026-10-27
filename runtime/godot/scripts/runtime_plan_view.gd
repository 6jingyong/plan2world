extends CanvasLayer

const UI := preload("res://scripts/runtime_ui.gd")
const CATALOG_VIEW := preload("res://scripts/furniture_catalog_view.gd")
signal menu_requested
signal walkthrough_requested
signal command_requested(command: Dictionary)
signal save_requested(path: String)
signal export_requested(path: String)
signal light_requested(id:String)
signal walls_requested
signal preview_requested(command:Dictionary)
signal opening_requested(id:String)
var controller
var _floor_selector: OptionButton
var _layer_selector:OptionButton
var _ceiling_dialog:ConfirmationDialog
var _ceiling_selector:OptionButton
var _ceiling_hosts:Array=[]
var _floor_ids: Array[String] = []
var _catalog: Array = []
var _catalog_view
var _catalog_toggle: Button
var _wall_selector: OptionButton
var _wall_ids: Array[String] = []
var _wall_floor_id := ""
var _mount_side: OptionButton
var _mount_height: SpinBox
var _mount_dialog: ConfirmationDialog
var _edit_buttons := {}
var _message: Label
var _notice := ""
var _save: FileDialog
var _export: FileDialog
var _screen: Control
var _selection: Label
var _selection_card: PanelContainer
var _state: Label
var _project_title: Label
var _snap: Button
var _grid: Button
var _snap_status: Label
var _snap_chip: PanelContainer
var _toast: PanelContainer
var _files: MenuButton
var _help: Label
var _framed_size := Vector2.ZERO
var _catalog_action := "AddFurniture"
var _external_dialogs:Array[Window]=[]
var _busy:=false
var _add_filter:Dictionary={}
var _replacement_id:=""

func register_dialog(dialog:Window) -> void:
	_external_dialogs.append(dialog)

func _ready() -> void:
	name = "PlanView"
	layer = 5
	process_mode = Node.PROCESS_MODE_ALWAYS
	_screen = Control.new()
	_screen.theme = UI.theme()
	_screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UI.fill(_screen)
	add_child(_screen)
	# Small mode/floor chip. The house, not a permanent inspector, fills the view.
	var mode := PanelContainer.new()
	mode.name = "Toolbar"; mode.position = Vector2(16,16)
	mode.add_theme_stylebox_override("panel", UI.box(UI.PAPER, 22, 12, true))
	_screen.add_child(mode)
	var mode_row := HBoxContainer.new(); mode.add_child(mode_row)
	mode_row.add_child(UI.label("Arrange", 20))
	_floor_selector = OptionButton.new(); _floor_selector.name = "FloorSelector"
	_floor_selector.custom_minimum_size.x = 108; _floor_selector.fit_to_longest_item = false
	_floor_selector.item_selected.connect(func(index: int): controller.select_floor(_floor_ids[index]); _fill_walls())
	mode_row.add_child(_floor_selector)
	_layer_selector=OptionButton.new();_layer_selector.name="EditingLayer";_layer_selector.add_item("Furniture");_layer_selector.add_item("Ceiling lights")
	_layer_selector.item_selected.connect(func(index:int):controller.set_ceiling_layer(index==1);_catalog_view.set_ceiling_layer(index==1);_catalog_action="AddFurniture";_fill_ceilings();_selection_changed())
	mode_row.add_child(_layer_selector)
	var navigation := HBoxContainer.new(); navigation.name = "Navigation"
	navigation.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	navigation.offset_left = -346; navigation.offset_right = -16; navigation.offset_top = 16
	_screen.add_child(navigation)
	navigation.add_child(UI.button("Walk  F2", "FirstPerson", func(): walkthrough_requested.emit(), true))
	_files = MenuButton.new(); _files.name = "LayoutFiles"; _files.text = "Layout…"
	_files.custom_minimum_size.y = 44; navigation.add_child(_files)
	_files.get_popup().add_item("Save layout…    Ctrl+S", 0)
	_files.get_popup().add_item("Export scene…", 1)
	_files.get_popup().id_pressed.connect(func(id: int): _action("SaveProject" if id==0 else "ExportScene"))
	navigation.add_child(UI.button("Menu F1", "SceneMenu", func(): menu_requested.emit()))
	var rail := PanelContainer.new(); rail.name = "ToolRail"; rail.position = Vector2(16,104)
	rail.add_theme_stylebox_override("panel", UI.box(UI.PAPER, 22, 8, true))
	_screen.add_child(rail)
	var tools := VBoxContainer.new(); tools.add_theme_constant_override("separation", 6); rail.add_child(tools)
	_catalog_toggle = UI.button("Items\nTab", "OpenCatalog", func(): set_catalog_open(not _catalog_view.visible))
	_catalog_toggle.toggle_mode = true; tools.add_child(_catalog_toggle)
	_catalog_toggle.tooltip_text = "Browse furniture · Tab"
	_snap = UI.button("Align", "MagneticSnap", func(): pass)
	_snap.toggle_mode = true; _snap.button_pressed = true; tools.add_child(_snap)
	_snap.tooltip_text = "Magnetic alignment · hold Alt to release while dragging"
	_grid = UI.button("Grid\n10 cm", "GridSnap", func(): pass)
	_grid.toggle_mode = true; _grid.button_pressed = true; tools.add_child(_grid)
	_grid.tooltip_text = "10 cm grid · first-person steps remain 1 cm"
	for button in [_snap, _grid]: button.toggled.connect(func(_value): _snapping_changed())
	tools.add_child(UI.button("Fit", "FitFloor", func(): controller.fit_floor()))
	tools.add_child(UI.button("Walls…", "EditWalls", func():walls_requested.emit()))
	for button in tools.get_children():
		button.add_theme_font_size_override("font_size",14)
		button.custom_minimum_size = Vector2(64,48)
	_catalog_view = CATALOG_VIEW.new(); _screen.add_child(_catalog_view)
	_catalog_view.hide()
	_catalog_view.close_requested.connect(func(): set_catalog_open(false))
	_catalog_view.place_requested.connect(_request_piece)
	_catalog_view.piece_chosen.connect(func(_index): _mount_fields())
	_mount_dialog = ConfirmationDialog.new(); _mount_dialog.name = "MountingDialog"
	_mount_dialog.title = "Wall installation"; _mount_dialog.theme = UI.theme()
	_mount_dialog.confirmed.connect(func(): _action(_catalog_action,true))
	add_child(_mount_dialog)
	var fields := VBoxContainer.new(); fields.custom_minimum_size.x = 320
	_mount_dialog.add_child(fields)
	fields.add_child(UI.label("Choose a wall, side and bottom height.",14,UI.MUTED))
	_wall_selector = OptionButton.new(); _wall_selector.name = "MountWall"
	_wall_selector.fit_to_longest_item = false
	_wall_selector.tooltip_text = "Explicit installation wall; dragging keeps this binding."
	fields.add_child(_wall_selector)
	fields.add_child(UI.button("Pick wall in plan","PickMountWall",func():_mount_dialog.hide();_catalog_view.hide();controller.begin_host_pick("wall");show_message("Click the installation wall. Then choose its side and height.")))
	_mount_side = OptionButton.new(); _mount_side.name = "MountSide"
	_mount_side.add_item("Wall · left side"); _mount_side.add_item("Wall · right side")
	fields.add_child(_mount_side)
	_mount_height = SpinBox.new(); _mount_height.name = "MountHeight"
	_mount_height.min_value = 0; _mount_height.max_value = 1000; _mount_height.value = 140
	_mount_height.suffix = "cm"; _mount_height.tooltip_text = "Bottom height above the floor"
	fields.add_child(_mount_height)
	_ceiling_dialog=ConfirmationDialog.new();_ceiling_dialog.name="CeilingMountDialog";_ceiling_dialog.title="Ceiling installation";_ceiling_dialog.theme=UI.theme();_ceiling_dialog.ok_button_text="Attach to ceiling"
	_ceiling_dialog.confirmed.connect(func():_action(_catalog_action,true));add_child(_ceiling_dialog)
	var ceiling_fields:=VBoxContainer.new();ceiling_fields.custom_minimum_size.x=340;_ceiling_dialog.add_child(ceiling_fields)
	ceiling_fields.add_child(UI.label("Choose the ceiling that supports this light.",14,UI.MUTED))
	_ceiling_selector=OptionButton.new();_ceiling_selector.name="CeilingHost";_ceiling_selector.fit_to_longest_item=false;ceiling_fields.add_child(_ceiling_selector)
	ceiling_fields.add_child(UI.button("Pick ceiling in plan","PickMountCeiling",func():_ceiling_dialog.hide();_catalog_view.hide();controller.begin_host_pick("ceiling");show_message("Click inside the installation ceiling.")))
	ceiling_fields.add_child(UI.label("Height follows the authored ceiling. No vertical offset.",14,UI.MUTED))
	# Selected-piece actions appear only when useful, near the input prompts.
	_selection_card = PanelContainer.new(); _selection_card.name = "SelectedPiece"
	_selection_card.mouse_filter=Control.MOUSE_FILTER_IGNORE
	_selection_card.add_theme_stylebox_override("panel", UI.box(UI.PAPER, 20, 12, true))
	_screen.add_child(_selection_card)
	var selection_column := VBoxContainer.new(); selection_column.add_theme_constant_override("separation",6)
	selection_column.mouse_filter=Control.MOUSE_FILTER_IGNORE
	_selection_card.add_child(selection_column)
	_selection = UI.label("",15); selection_column.add_child(_selection)
	var actions := HBoxContainer.new(); selection_column.add_child(actions)
	actions.mouse_filter=Control.MOUSE_FILTER_IGNORE
	for pair in [["ReplaceFurniture","Modify  M"],["RotateFurniture","Rotate  R"],["DeleteFurniture","Remove  Del"],["LightSettings","Light… L"]]:
		var button := UI.button(pair[1],pair[0],_action.bind(pair[0]))
		(actions if pair[0]=="ReplaceFurniture" else _catalog_view.actions).add_child(button); _edit_buttons[pair[0]] = button
	_project_title = UI.label("Your space",22); _project_title.name = "ProjectTitle"
	_project_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_project_title.add_theme_color_override("font_shadow_color",UI.PAPER)
	_project_title.add_theme_constant_override("shadow_outline_size",4)
	_screen.add_child(_project_title)
	_state = UI.label("",13,UI.MUTED); _screen.add_child(_state)
	_help = UI.label("",14)
	_help.add_theme_stylebox_override("normal",UI.box(UI.PAPER,18,12,true))
	_screen.add_child(_help)
	_toast = PanelContainer.new(); _toast.name = "LayoutNotice"
	_screen.add_child(_toast)
	_message = UI.label("",14); _message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_message.max_lines_visible = 4; _toast.add_child(_message)
	_snap_chip = PanelContainer.new(); _snap_chip.name = "PlacementHint"
	_snap_chip.add_theme_stylebox_override("panel",UI.box(UI.PAPER,16,10,true))
	_screen.add_child(_snap_chip)
	_snap_status = UI.label("",14); _snap_chip.add_child(_snap_status)
	for overlay in [_project_title,_state,_help,_toast,_snap_chip]: UI.ignore_pointer(overlay)
	_save = _save_dialog("Save your layout","*.json ; Plan2World Project","project.json")
	_save.file_selected.connect(func(path: String): save_requested.emit(path))
	_export = _save_dialog("Export runtime scene","*.zip ; Runtime scene ZIP","scene.runtime.zip")
	_export.file_selected.connect(func(path: String): export_requested.emit(path))
	_screen.resized.connect(func(): _frame_view.call_deferred())
	for overlay in [_help,_selection_card,_toast]: overlay.minimum_size_changed.connect(func(): _frame_view.call_deferred())
	hide()

func _save_dialog(title: String, filter: String, filename: String) -> FileDialog:
	var dialog := FileDialog.new(); dialog.title = title
	dialog.access = FileDialog.ACCESS_FILESYSTEM; dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	dialog.filters = PackedStringArray([filter]); dialog.current_file = filename; dialog.use_native_dialog = true
	add_child(dialog)
	return dialog

func has_open_dialog() -> bool:
	return _save.visible or _export.visible or _files.get_popup().visible or _mount_dialog.visible or _ceiling_dialog.visible or _external_dialogs.any(func(dialog):return is_instance_valid(dialog) and dialog.visible)

func configure(data: Dictionary, camera_controller) -> void:
	controller = camera_controller
	controller.snap_changed.connect(func(text: String): _snap_status.text = text)
	controller.furniture_selected.connect(func(_id: String): _selection_changed())
	controller.gesture_changed.connect(func(_moving: bool): _context())
	controller.furniture_moved.connect(func(id: String, point: Vector3): command_requested.emit(controller.move_command(id,point)))
	controller.placement_requested.connect(func(command:Dictionary):command_requested.emit(command))
	controller.host_picked.connect(func(kind:String,id:String):
		if kind=="wall":
			_wall_selector.select(_wall_ids.find(id));_mount_dialog.popup_centered()
		else:
			for i in range(_ceiling_hosts.size()):
				if _ceiling_hosts[i]["id"]==id:_ceiling_selector.select(i)
			_ceiling_dialog.popup_centered()
		show_message(""))
	controller.placement_blocked.connect(func(): show_message("Placement blocked. Keep furniture clear of obstacles, doorways and floor holes."))
	for floor in data["floors"]:
		_floor_ids.append(str(floor["id"])); _floor_selector.add_item(str(floor["name"]))
	_project_title.text = data["source"]["projectName"]
	_fill_walls()
	set_editor({},false,false)

func set_editor(state: Dictionary, busy: bool, dirty: bool) -> void:
	var editable := not state.is_empty()
	_busy=busy
	find_child("EditWalls",true,false).disabled=not editable or busy
	controller.editing = editable and not busy
	for name in ["FirstPerson","FloorSelector","FitFloor","EditingLayer"]: find_child(name,true,false).disabled = busy
	if _catalog.is_empty() and editable:
		_catalog = state["catalog"]; _catalog_view.configure(_catalog)
	_catalog_view.set_editable(editable and not busy)
	_catalog_toggle.disabled = not editable or busy
	_files.disabled = not editable or busy
	for field in [_wall_selector,_mount_side,_snap]: field.disabled = not editable or busy
	_mount_height.editable = editable and not busy
	_grid.disabled = not editable or busy or not _snap.button_pressed
	_state.text = ("Changing view…" if controller.transitioning else "Placing…") if busy else ("Unsaved layout" if dirty else ("Layout saved" if editable else "View only"))
	if _floor_ids.has(controller.floor_id): _floor_selector.select(_floor_ids.find(controller.floor_id))
	_selection_changed(); _mount_fields()
	_fill_ceilings()
	_frame_view.call_deferred()

func show_message(text: String) -> void:
	_notice = text; _message.text = text; _message.tooltip_text = text
	_toast.visible = not text.is_empty()

func set_catalog_open(open: bool, replacing := false) -> void:
	controller.cancel_drag()
	_catalog_view.visible = open
	if open:
		if replacing and _catalog_action!="ReplaceFurniture":
			_add_filter={"category":_catalog_view._tabs.current_tab,"search":_catalog_view._search.text}
		elif not replacing and _catalog_action=="ReplaceFurniture":
			_catalog_view.set_ceiling_layer(controller.ceiling_editing)
			_catalog_view._tabs.current_tab=mini(int(_add_filter.get("category",0)),_catalog_view._tabs.tab_count-1)
			_catalog_view._search.text=_add_filter.get("search","");_catalog_view._filter()
		_catalog_action = "ReplaceFurniture" if replacing else "AddFurniture"
		if replacing:_replacement_id=controller.selected_id
		_catalog_view.set_purpose("Modify furniture" if replacing else "Furniture",replacing)
		_catalog_view.place.text = "Swap selected piece" if replacing else "Add at view centre"
		if replacing:
			var entity:Dictionary=controller._entities.get(controller.selected_id,{})
			_catalog_view.set_ceiling_layer(entity.get("movement",{}).get("kind")=="ceiling")
			for i in range(_catalog.size()):
				if _catalog[i]["asset"].get("catalogId")==entity.get("catalogId"):_catalog_view.reveal(i);break
	_catalog_toggle.set_pressed_no_signal(open)
	if open: _catalog_view.list.grab_focus()
	if not open:
		var focus := get_viewport().gui_get_focus_owner()
		if focus != null: focus.release_focus()
	_mount_fields()
	_context(); _frame_view()

func _request_piece() -> void:
	var index: int = _catalog_view.selected_index
	if index<0: return
	if _catalog[index].get("mounting")=="wall":
		_mount_dialog.ok_button_text = "Swap" if _catalog_action=="ReplaceFurniture" else "Place"
		_mount_dialog.popup_centered()
	elif _catalog[index].get("mounting")=="ceiling":
		_fill_ceilings()
		if _ceiling_hosts.is_empty():show_message("This floor has no supported horizontal ceiling. Correct the native Project before attaching a light.");return
		_ceiling_dialog.popup_centered()
	else: _action(_catalog_action,true)

func command_applied(command: Dictionary) -> void:
	if command["type"] in ["add","replace"]: set_catalog_open(false)
	_selection_changed()

func _context() -> void:
	if controller == null: return
	var chosen: bool = controller._entities.has(controller.selected_id) and controller._entities[controller.selected_id]["kind"] in ["furniture","door","window"]
	_selection_card.visible = chosen and controller.editing and not _busy and not _catalog_view.visible and not controller._moving and not has_open_dialog()
	_help.text = "Click to place · Esc cancel · Alt free" if controller.has_placement_preview() else ("Release to place · Esc cancel · Alt free" if controller._moving else ("Select a piece · Double-click to place · Esc close" if _catalog_view.visible else "Click select · Right drag pan · Scroll zoom"))
	_snap_chip.visible = controller._moving and not _snap_status.text.is_empty()
	_toast.visible = not _notice.is_empty()

func _process(_delta: float) -> void:
	if not visible or controller == null or not controller.active: return
	_context()
	if _selection_card.visible:_position_selection()
	if _snap_chip.visible:
		_snap_chip.position = (get_viewport().get_mouse_position()+Vector2(18,20)).clamp(Vector2(100,96),_screen.size-_snap_chip.size-Vector2(16,90))

func _selection_changed() -> void:
	if _wall_floor_id != controller.floor_id: _fill_walls()
	if _catalog_action=="ReplaceFurniture" and controller.selected_id!=_replacement_id:
		set_catalog_open(false);_catalog_action="AddFurniture"
	for action in _edit_buttons.values(): action.disabled = true
	var selected:Dictionary=controller._entities.get(controller.selected_id,{})
	if selected.get("kind") in ["door","window"]:
		_selection.text="Door" if selected["kind"]=="door" else "Window"
		_edit_buttons["ReplaceFurniture"].disabled=not controller.editing or _busy
	if controller._entities.has(controller.selected_id) and controller._entities[controller.selected_id]["kind"] == "furniture":
		var entity: Dictionary = controller._entities[controller.selected_id]
		_selection.text = str(entity["catalogId"]).replace("_"," ").capitalize() + (" · locked" if entity["locked"] else "")
		if controller._models.has(entity["id"]) and not controller._models[entity["id"]].has_meta("p2w_asset_ref"):
			_selection.text=str(entity.get("sourceCategory",entity["catalogId"])).replace("_"," ").capitalize()+" · placeholder"+(" · locked" if entity["locked"] else "")
		for action in _edit_buttons.values(): action.disabled = not controller.editing or entity["locked"]
		_edit_buttons["RotateFurniture"].disabled = not controller.editing or entity["locked"] or entity["movement"]["kind"] not in ["floor","ceiling"]
		_edit_buttons["LightSettings"].visible=entity.has("light")
		for name in ["RotateFurniture","DeleteFurniture"]:_edit_buttons[name].visible=_catalog_action=="ReplaceFurniture"
		if entity["movement"]["kind"] == "wall":
			var index := _wall_ids.find(entity["movement"]["wallId"])
			if index>=0: _wall_selector.select(index)
			_mount_side.select(0 if entity["movement"]["side"]=="left" else 1)
			_mount_height.value = (float(entity["position"][1])-float(entity["movement"]["origin"][1])-float(entity["size"][1])/2)*100
	if controller.selected_id.is_empty() and _catalog_action=="ReplaceFurniture":
		_catalog_action="AddFurniture"
		_mount_fields()
	_context()

func _position_selection() -> void:
	var entity:Dictionary=controller._entities[controller.selected_id]
	var point:Array=entity.get("position",entity.get("closedPose",{}).get("center",entity.get("center",[0,0,0])))
	var screen:Vector2=controller.camera.unproject_position(controller._vec3(point))
	_selection_card.size=Vector2.ZERO
	var size:Vector2=_selection_card.size
	var upper:Vector2=(_screen.size-size-Vector2(16,96)).max(Vector2(100,90))
	var neighbors:Array[Vector2]=[]
	for other in controller._entities.values():
		if other["id"]==controller.selected_id or other["floorId"]!=controller.floor_id or other["kind"] not in ["furniture","door","window"]:continue
		var center:Array=other.get("position",other.get("closedPose",{}).get("center",other.get("center",[0,0,0])))
		neighbors.append(controller.camera.unproject_position(controller._vec3(center)))
	var best:=Vector2.ZERO;var best_score:=INF
	for offset in [Vector2(20,-size.y-16),Vector2(20,16),Vector2(-size.x-20,-size.y-16),Vector2(-size.x-20,16)]:
		var candidate:Vector2=(screen+offset).clamp(Vector2(100,90),upper)
		var score:float=candidate.distance_squared_to(screen+offset)
		for neighbor in neighbors:
			if Rect2(candidate,size).grow(12).has_point(neighbor):score+=1000000
		if score<best_score:best=candidate;best_score=score
	_selection_card.position=best

func _action(action: String,preview:=false) -> void:
	var command := {"floorId":controller.floor_id,"id":controller.selected_id}
	var index: int = _catalog_view.selected_index
	match action:
		"LightSettings":light_requested.emit(controller.selected_id);return
		"AddFurniture":
			if index<0: return
			var point: Vector2 = controller.view_center()
			command.merge({"type":"add","position":{"x":point.x*100,"y":point.y*100},"asset":_catalog[index]["asset"]})
		"RotateFurniture": command.merge({"type":"rotate","rotation":rad_to_deg(controller._entities[controller.selected_id]["yawClockwiseRadians"])+90})
		"ReplaceFurniture":
			if not controller._entities.has(controller.selected_id):return
			if controller._entities.get(controller.selected_id,{}).get("kind") in ["door","window"]:opening_requested.emit(controller.selected_id);return
			if not _catalog_view.visible:
				set_catalog_open(true,true); return
			if index<0: return
			command.merge({"type":"replace","asset":_catalog[index]["asset"]})
		"DeleteFurniture": command["type"] = "remove"
		"SaveProject": _save.popup_centered_ratio(.8); return
		"ExportScene": _export.popup_centered_ratio(.8); return
	if action in ["AddFurniture","ReplaceFurniture"] and _catalog[index].get("mounting")=="wall":
		if _wall_ids.is_empty(): show_message("Choose a floor with a straight solid wall."); return
		command["wallMount"] = {"wallId":_wall_ids[_wall_selector.selected],"side":"left" if _mount_side.selected==0 else "right","elevation":_mount_height.value}
	if action in ["AddFurniture","ReplaceFurniture"] and _catalog[index].get("mounting")=="ceiling":
		if _ceiling_hosts.is_empty():return
		command["ceilingMount"]={"wallIds":_ceiling_hosts[_ceiling_selector.selected]["ceilingWallIds"]}
	if preview:preview_requested.emit(command)
	else:command_requested.emit(command)

func _fill_ceilings() -> void:
	var previous:Variant=_ceiling_selector.get_item_metadata(_ceiling_selector.selected) if _ceiling_selector.selected>=0 else null
	_ceiling_hosts=[];_ceiling_selector.clear()
	for floor in controller.data["floors"]:
		if floor["id"]!=controller.floor_id:continue
		for room in floor["rooms"]:
			if room["ceilingHeight"]==null or not room.has("ceilingWallIds"):continue
			_ceiling_hosts.append(room);_ceiling_selector.add_item("%s · %.2f m" % [room["name"],room["ceilingHeight"]]);_ceiling_selector.set_item_metadata(_ceiling_selector.item_count-1,room["id"])
			if room["id"]==previous:_ceiling_selector.select(_ceiling_selector.item_count-1)

func _snapping_changed() -> void:
	controller.set_snapping(_snap.button_pressed,_grid.button_pressed)
	_grid.disabled = not _snap.button_pressed or not controller.editing

func _fill_walls() -> void:
	_wall_floor_id = controller.floor_id; _wall_ids.clear(); _wall_selector.clear()
	for entity in controller.data["entities"]:
		if entity["floorId"]==controller.floor_id and entity["kind"]=="wall" and entity["boundaryType"]=="solid" and not entity["path"].has("control"):
			_wall_ids.append(entity["id"])
			var a: Array = entity["path"]["start"]; var b: Array = entity["path"]["end"]
			_wall_selector.add_item("Wall %d · %.1f m"%[_wall_ids.size(),Vector2(a[0],a[1]).distance_to(Vector2(b[0],b[1]))])
	_mount_fields()

func _mount_fields() -> void:
	var index: int = _catalog_view.selected_index
	var mounted: bool = index>=0 and _catalog[index].get("mounting")=="wall"
	_catalog_view.place.text = ("Choose wall & preview…" if mounted else "Preview replacement") if _catalog_action=="ReplaceFurniture" else ("Choose wall & preview…" if mounted else "Place in room…")
	if index>=0 and _catalog[index].get("mounting")=="ceiling":_catalog_view.place.text="Choose ceiling & preview…"

func _frame_view() -> void:
	if not visible or not controller.active: return
	var screen := _screen.size
	var width := minf(360,screen.x*.46)
	_catalog_view.position = Vector2(screen.x-width-16,90)
	_catalog_view.size = Vector2(width,screen.y-106)
	_project_title.position = Vector2(20,screen.y-82); _project_title.size = Vector2(minf(320,screen.x*.3),30)
	_state.position = Vector2(20,screen.y-48)
	_help.size = Vector2.ZERO
	var help_right: float = _catalog_view.position.x-16 if _catalog_view.visible else screen.x-16
	_help.position = Vector2(maxf(16,help_right-_help.get_combined_minimum_size().x),screen.y-(140 if _catalog_view.visible else 64))
	_selection_card.size = Vector2.ZERO
	_selection_card.position = Vector2(screen.x-_selection_card.get_combined_minimum_size().x-16,screen.y-162)
	_toast.size.x = minf(680,screen.x-32)
	_toast.position = Vector2((screen.x-_toast.size.x)/2,screen.y-270)
	var right := width+32 if _catalog_view.visible else 16.0
	var resized := _framed_size!=screen
	if resized or controller.inset_left!=100 or controller.inset_right!=right or controller.inset_top!=90 or controller.inset_bottom!=96:
		_framed_size=screen
		controller.set_view_insets(100,right,90,96)

func cancel_drag() -> void:
	controller.cancel_drag()

func _input(event: InputEvent) -> void:
	if not visible or controller==null or not controller.active or has_open_dialog(): return
	if not event is InputEventKey or not event.pressed or event.echo: return
	# Inventory is a game-mode shortcut even when a grid/button has GUI focus.
	if event.keycode==KEY_TAB and (_catalog_view.visible or controller.editing):
		set_catalog_open(not _catalog_view.visible)
	elif event.ctrl_pressed and event.keycode==KEY_F and _catalog_view.visible and _catalog_view._enabled:
		_catalog_view._search.grab_focus(); _catalog_view._search.select_all()
	else: return
	get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if visible and controller!=null and controller.active and _catalog_view.visible and not has_open_dialog() and event is InputEventJoypadButton and event.is_action_pressed("layout_cancel"):
		set_catalog_open(false)
		get_viewport().set_input_as_handled()

func _unhandled_key_input(event: InputEvent) -> void:
	if not visible or controller==null or not controller.active or has_open_dialog(): return
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode==KEY_ESCAPE and _catalog_view.visible:
		set_catalog_open(false)
		get_viewport().set_input_as_handled()
		return
	if controller.transitioning or not controller.editing: return
	if event.ctrl_pressed and event.keycode==KEY_S: _action("SaveProject")
	elif not _catalog_view.visible and not controller._moving and event.keycode in [KEY_R,KEY_X,KEY_DELETE] and not controller.selected_id.is_empty():
		var action := {KEY_R:"RotateFurniture",KEY_X:"ReplaceFurniture",KEY_DELETE:"DeleteFurniture"}
		if not _edit_buttons[action[event.keycode]].disabled: _action(action[event.keycode])
	else: return
	get_viewport().set_input_as_handled()
