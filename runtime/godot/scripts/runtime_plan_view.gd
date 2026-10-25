extends CanvasLayer

const UI := preload("res://scripts/runtime_ui.gd")

signal menu_requested
signal walkthrough_requested
signal command_requested(command: Dictionary)
signal save_requested(path: String)
signal export_requested(path: String)
var controller
var _floor_selector: OptionButton
var _floor_ids: Array[String] = []
var _catalog: Array = []
var _palette: OptionButton
var _wall_selector: OptionButton
var _wall_ids: Array[String] = []
var _wall_floor_id := ""
var _mount_side: OptionButton
var _mount_height: SpinBox
var _edit_buttons: Dictionary = {}
var _message: Label
var _notice := ""
var _save: FileDialog
var _export: FileDialog
var _screen: Control
var _selection: Label
var _state: Label
var _snap: Button
var _grid: Button
var _snap_status: Label
var _sidebar: PanelContainer
var _footer: PanelContainer
var _framed_size := Vector2.ZERO

func _ready() -> void:
	name = "PlanView"
	layer = 5
	process_mode = Node.PROCESS_MODE_ALWAYS
	_screen = Control.new()
	_screen.theme = UI.theme()
	_screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UI.fill(_screen)
	add_child(_screen)
	var panel := PanelContainer.new()
	panel.name = "Toolbar"
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	panel.offset_left = 16; panel.offset_right = -16; panel.offset_top = 16
	_screen.add_child(panel)
	var toolbar := HBoxContainer.new()
	panel.add_child(toolbar)
	var identity := VBoxContainer.new()
	identity.add_theme_constant_override("separation", 0)
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toolbar.add_child(identity)
	identity.add_child(UI.label("Your space", 24))
	_state = UI.label("Arrange & explore", 13, UI.MUTED)
	identity.add_child(_state)
	_floor_selector = OptionButton.new()
	_floor_selector.name = "FloorSelector"
	_floor_selector.item_selected.connect(func(index: int): controller.select_floor(_floor_ids[index]); _fill_walls())
	_floor_selector.custom_minimum_size.x = 100
	_floor_selector.fit_to_longest_item = false
	toolbar.add_child(_floor_selector)
	toolbar.add_child(UI.button("Fit view", "FitFloor", func(): controller.fit_floor()))
	toolbar.add_child(UI.button("Walk inside  F2", "FirstPerson", func(): walkthrough_requested.emit(), true))
	toolbar.add_child(UI.button("Menu  F1", "SceneMenu", func(): menu_requested.emit()))
	_sidebar = PanelContainer.new()
	_sidebar.name = "FurnishingPanel"
	_sidebar.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	_sidebar.offset_left = 16; _sidebar.offset_right = 280
	_sidebar.offset_top = 112; _sidebar.offset_bottom = -128
	_screen.add_child(_sidebar)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_sidebar.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	scroll.add_child(column)
	column.add_child(UI.label("A place for everything", 19))
	var hint := UI.label("Drag to arrange. Right drag to pan.\nScroll to zoom. Esc cancels.", 13, UI.MUTED)
	column.add_child(hint)
	_palette = OptionButton.new()
	_palette.name = "FurnitureCatalog"
	_palette.fit_to_longest_item = false
	_palette.custom_minimum_size.y = 44
	column.add_child(_palette)
	_palette.item_selected.connect(func(_index): _mount_fields())
	_wall_selector = OptionButton.new()
	_wall_selector.name = "MountWall"
	_wall_selector.fit_to_longest_item = false
	_wall_selector.tooltip_text = "Choose the authored wall for this piece. Dragging keeps this binding."
	column.add_child(_wall_selector)
	_mount_side = OptionButton.new()
	_mount_side.name = "MountSide"
	_mount_side.add_item("Wall · left side")
	_mount_side.add_item("Wall · right side")
	column.add_child(_mount_side)
	_mount_height = SpinBox.new()
	_mount_height.name = "MountHeight"
	_mount_height.min_value = 0
	_mount_height.max_value = 1000
	_mount_height.value = 140
	_mount_height.suffix = "cm"
	_mount_height.tooltip_text = "Bottom height above this floor"
	column.add_child(_mount_height)
	_add_action(column, "AddFurniture", "Place at view centre", true)
	_edit_buttons["AddFurniture"].tooltip_text = "Pan to a free spot, then add. Drag the piece to refine its placement."
	column.add_child(HSeparator.new())
	_selection = UI.label("Select a piece to arrange", 14, UI.MUTED)
	_selection.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_selection)
	var edit := HBoxContainer.new()
	column.add_child(edit)
	_add_action(edit, "RotateFurniture", "Rotate 90°")
	_add_action(edit, "DeleteFurniture", "Remove")
	_add_action(column, "ReplaceFurniture", "Swap with chosen piece")
	column.add_child(HSeparator.new())
	_footer = PanelContainer.new()
	_footer.name = "ContextBar"
	_footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_footer.offset_left = 16; _footer.offset_right = -16
	_footer.offset_top = -112; _footer.offset_bottom = -16
	_screen.add_child(_footer)
	var footer_column := VBoxContainer.new()
	footer_column.add_theme_constant_override("separation", 4)
	_footer.add_child(footer_column)
	var options := HBoxContainer.new()
	footer_column.add_child(options)
	_snap = UI.button("Magnet on", "MagneticSnap", func(): pass)
	_snap.toggle_mode = true; _snap.button_pressed = true
	_snap.tooltip_text = "Align to nearby straight walls and furniture. Hold Alt to release while dragging."
	_snap.toggled.connect(func(value): _snap.text = "Magnet on" if value else "Magnet off"; _snapping_changed())
	options.add_child(_snap)
	_grid = UI.button("Grid 10 cm", "GridSnap", func(): pass)
	_grid.toggle_mode = true; _grid.button_pressed = true
	_grid.tooltip_text = "Use a 10 cm grid in top view. First-person steps remain 1 cm."
	_grid.toggled.connect(func(_value): _snapping_changed())
	options.add_child(_grid)
	_snap_status = UI.label("Alt · free placement", 13, UI.MUTED)
	_snap_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_snap_status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	options.add_child(_snap_status)
	_add_action(options, "SaveProject", "Save layout…")
	_add_action(options, "ExportScene", "Export…")
	for action in ["SaveProject", "ExportScene"]: _edit_buttons[action].size_flags_horizontal = Control.SIZE_SHRINK_END
	_message = UI.label("Open an editable Project to arrange furniture.", 14)
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_message.max_lines_visible = 3
	footer_column.add_child(_message)
	_save = _save_dialog("Save your layout", "*.json ; Plan2World Project", "project.json")
	_save.file_selected.connect(func(path: String): save_requested.emit(path))
	_export = _save_dialog("Export runtime scene", "*.zip ; Runtime scene ZIP", "scene.runtime.zip")
	_export.file_selected.connect(func(path: String): export_requested.emit(path))
	_screen.resized.connect(func(): _frame_view.call_deferred())
	_footer.minimum_size_changed.connect(func(): _frame_view.call_deferred())
	hide()

func _add_action(parent: Control, id: String, text: String, primary := false) -> void:
	var button := UI.button(text, id, _action.bind(id), primary)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(button)
	_edit_buttons[id] = button

func _snapping_changed() -> void:
	controller.set_snapping(_snap.button_pressed, _grid.button_pressed)
	_grid.disabled = not _snap.button_pressed or not controller.editing
	_snap_status.text = "Alt · free placement" if _snap.button_pressed else "Free placement · alignment off"

func _save_dialog(title: String, filter: String, filename: String) -> FileDialog:
	var dialog := FileDialog.new()
	dialog.title = title
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	dialog.filters = PackedStringArray([filter])
	dialog.current_file = filename
	dialog.use_native_dialog = true
	add_child(dialog)
	return dialog

func has_open_dialog() -> bool:
	return _save.visible or _export.visible

func set_editor(state: Dictionary, busy: bool, dirty: bool) -> void:
	var editable := not state.is_empty()
	controller.editing = editable and not busy
	for name in ["FirstPerson", "FloorSelector", "FitFloor"]:
		find_child(name, true, false).disabled = busy
	if _catalog.is_empty() and editable:
		_catalog = state["catalog"]
		for item in _catalog:
			_palette.add_item(str(item["label"]))
	for button in _edit_buttons.values():
		button.disabled = not editable or busy
	_palette.disabled = not editable or busy
	for field in [_wall_selector, _mount_side, _snap]: field.disabled = not editable or busy
	_mount_height.editable = editable and not busy
	_grid.disabled = not editable or busy or not _snap.button_pressed
	_state.text = "Placing your piece…" if busy else ("Unsaved layout" if dirty else ("Layout saved" if editable else "View only · open a Project to arrange"))
	_message.text = _notice if not _notice.is_empty() else ("Applying layout…" if busy else ("Unsaved layout changes" if dirty else ("Drag furniture to move it. Buildings remain fixed." if editable else "Open an editable Project to arrange furniture.")))
	if _floor_ids.has(controller.floor_id): _floor_selector.select(_floor_ids.find(controller.floor_id))
	_selection_changed()
	_mount_fields()
	_frame_view.call_deferred()

func show_message(message: String) -> void:
	_notice = message
	_message.text = message
	_message.tooltip_text = message

func _selection_changed() -> void:
	if _wall_floor_id != controller.floor_id: _fill_walls()
	_selection.text = "Select a piece to arrange"
	for name in ["RotateFurniture", "ReplaceFurniture", "DeleteFurniture"]:
		_edit_buttons[name].disabled = not controller.editing or controller.selected_id.is_empty()
	if controller._entities.has(controller.selected_id) and controller._entities[controller.selected_id]["kind"] == "furniture":
		var entity: Dictionary = controller._entities[controller.selected_id]
		_selection.text = str(entity.get("catalogId", "Furniture")).replace("_", " ").capitalize() + (" · locked" if entity.get("locked", false) else " · selected")
		for action in ["ReplaceFurniture", "DeleteFurniture"]: _edit_buttons[action].disabled = not controller.editing or entity.get("locked", false)
		_edit_buttons["RotateFurniture"].disabled = not controller.editing or entity["movement"]["kind"] != "floor" or entity.get("locked", false)
		if entity["movement"]["kind"] == "wall":
			var wall_index := _wall_ids.find(str(entity["movement"]["wallId"]))
			if wall_index >= 0: _wall_selector.select(wall_index)
			_mount_side.select(0 if entity["movement"]["side"] == "left" else 1)
			_mount_height.value = (float(entity["position"][1])-float(entity["movement"]["origin"][1])-float(entity["size"][1])/2)*100

func _action(action: String) -> void:
	var command := { "floorId": controller.floor_id, "id": controller.selected_id }
	match action:
		"AddFurniture":
			var point: Vector2 = controller.view_center()
			command.merge({ "type": "add", "position": { "x": point.x * 100, "y": point.y * 100 }, "asset": _catalog[_palette.selected]["asset"] }, true)
		"RotateFurniture":
			for entity in controller.data["entities"]:
				if entity["id"] == controller.selected_id:
					command.merge({ "type": "rotate", "rotation": rad_to_deg(float(entity["yawClockwiseRadians"])) + 90.0 }, true)
		"ReplaceFurniture": command.merge({ "type": "replace", "asset": _catalog[_palette.selected]["asset"] }, true)
		"DeleteFurniture": command["type"] = "remove"
		"SaveProject": _save.popup_centered_ratio(0.8); return
		"ExportScene": _export.popup_centered_ratio(0.8); return
	if action in ["AddFurniture", "ReplaceFurniture"] and _catalog[_palette.selected].get("mounting") == "wall":
		if _wall_ids.is_empty():
			show_message("Choose a floor with an authored straight solid wall.")
			return
		command["wallMount"] = { "wallId": _wall_ids[_wall_selector.selected], "side": "left" if _mount_side.selected == 0 else "right", "elevation": _mount_height.value }
	command_requested.emit(command)

func configure(data: Dictionary, camera_controller) -> void:
	controller = camera_controller
	# Containers report intermediate wrapped heights before their widths settle.
	find_child("Toolbar", true, false).resized.connect(func(): _frame_view.call_deferred())
	controller.snap_changed.connect(func(text: String): _snap_status.text = text if not text.is_empty() else ("Alt · free placement" if _snap.button_pressed else "Free placement · alignment off"))
	controller.furniture_selected.connect(func(_id: String): _selection_changed())
	controller.furniture_moved.connect(func(id: String, point: Vector3): command_requested.emit(controller.move_command(id, point)))
	controller.placement_blocked.connect(func(): show_message("Furniture overlaps an obstacle."))
	for floor in data.get("floors", []):
		_floor_ids.append(str(floor["id"]))
		_floor_selector.add_item(str(floor["name"]))
	if not _floor_ids.is_empty():
		_floor_selector.select(0)
	_fill_walls()
	set_editor({}, false, false)

func _frame_view() -> void:
	if not visible or not controller.active: return
	var top: float = find_child("Toolbar", true, false).position.y + find_child("Toolbar", true, false).size.y + 12
	_sidebar.offset_top = top
	_footer.offset_top = -maxf(96, _footer.get_combined_minimum_size().y) - 16
	_sidebar.offset_bottom = _footer.offset_top - 16
	var left := _sidebar.offset_right + 16
	var bottom := -_footer.offset_top + 12
	if _framed_size == _screen.size and absf(controller.inset_top - top) < 1 and absf(controller.inset_left - left) < 1 and absf(controller.inset_bottom - bottom) < 1: return
	_framed_size = _screen.size
	controller.inset_top = top
	controller.inset_left = left
	controller.inset_bottom = bottom
	controller.fit_floor()

func cancel_drag() -> void:
	controller.cancel_drag()

func _fill_walls() -> void:
	_wall_floor_id = controller.floor_id
	_wall_ids.clear()
	_wall_selector.clear()
	for entity in controller.data["entities"]:
		if entity["floorId"] == controller.floor_id and entity["kind"] == "wall" and entity["boundaryType"] == "solid" and not entity["path"].has("control"):
			_wall_ids.append(entity["id"])
			_wall_selector.add_item("Wall %d (%s)" % [_wall_ids.size(), entity["id"]])
	_mount_fields()

func _mount_fields() -> void:
	var mounted: bool = not _catalog.is_empty() and _catalog[_palette.selected].get("mounting") == "wall"
	_wall_selector.visible = mounted
	_mount_side.visible = mounted
	_mount_height.visible = mounted
