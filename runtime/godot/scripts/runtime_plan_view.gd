extends CanvasLayer

signal walkthrough_requested
signal command_requested(command: Dictionary)
signal undo_requested
signal redo_requested
signal save_requested(path: String)
signal export_requested(path: String)
var controller
var _floor_selector: OptionButton
var _floor_ids: Array[String] = []
var _catalog: Array = []
var _palette: OptionButton
var _edit_buttons: Dictionary = {}
var _message: Label
var _save: FileDialog
var _export: FileDialog

func _ready() -> void:
	name = "PlanView"
	layer = 5
	process_mode = Node.PROCESS_MODE_ALWAYS
	var panel := PanelContainer.new()
	panel.name = "Toolbar"
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	add_child(panel)
	var screen := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		screen.add_theme_constant_override("margin_" + side, 12)
	panel.add_child(screen)
	var column := VBoxContainer.new()
	screen.add_child(column)
	var toolbar := HBoxContainer.new()
	column.add_child(toolbar)
	var back := Button.new()
	back.name = "FirstPerson"
	back.text = "First person (F2)"
	back.pressed.connect(func(): walkthrough_requested.emit())
	toolbar.add_child(back)
	_floor_selector = OptionButton.new()
	_floor_selector.name = "FloorSelector"
	_floor_selector.item_selected.connect(func(index: int): controller.select_floor(_floor_ids[index]))
	toolbar.add_child(_floor_selector)
	var fit := Button.new()
	fit.name = "FitFloor"
	fit.text = "Fit floor"
	fit.pressed.connect(func(): controller.fit_floor())
	toolbar.add_child(fit)
	var help := Label.new()
	help.text = "Top view · middle/right drag to pan · wheel to zoom"
	help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	toolbar.add_child(help)
	var tools := HFlowContainer.new()
	column.add_child(tools)
	_palette = OptionButton.new()
	_palette.name = "FurnitureCatalog"
	_palette.custom_minimum_size.x = 180
	tools.add_child(_palette)
	for pair in [["AddFurniture", "Add"], ["RotateFurniture", "Rotate 90°"], ["ReplaceFurniture", "Replace"], ["DeleteFurniture", "Delete"], ["UndoLayout", "Undo"], ["RedoLayout", "Redo"], ["SaveProject", "Save Project…"], ["ExportScene", "Export scene…"]]:
		var button := Button.new()
		button.name = pair[0]
		button.text = pair[1]
		if pair[0] == "AddFurniture":
			button.tooltip_text = "Add at the view center. Pan to choose a free location."
		button.pressed.connect(_action.bind(str(pair[0])))
		tools.add_child(button)
		_edit_buttons[pair[0]] = button
	_message = Label.new()
	_message.text = "Open an editable Project to arrange furniture."
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_message)
	_save = _save_dialog("Save native Project", "*.json ; Plan2World Project", "project.json")
	_save.file_selected.connect(func(path: String): save_requested.emit(path))
	_export = _save_dialog("Export runtime scene", "*.zip ; Runtime scene ZIP", "scene.runtime.zip")
	_export.file_selected.connect(func(path: String): export_requested.emit(path))
	hide()

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

func set_editor(revision: Dictionary, busy: bool, can_undo: bool, can_redo: bool, dirty: bool) -> void:
	var editable := not revision.is_empty()
	controller.editing = editable and not busy
	for name in ["FirstPerson", "FloorSelector", "FitFloor"]:
		find_child(name, true, false).disabled = busy
	if _catalog.is_empty() and editable:
		_catalog = revision["catalog"]
		for item in _catalog:
			_palette.add_item(str(item["label"]))
	for button in _edit_buttons.values():
		button.disabled = not editable or busy
	_palette.disabled = not editable or busy
	_edit_buttons["UndoLayout"].disabled = not can_undo or busy
	_edit_buttons["RedoLayout"].disabled = not can_redo or busy
	_message.text = "Applying layout…" if busy else ("Unsaved layout changes" if dirty else ("Drag furniture to move it. Buildings remain fixed." if editable else "Open an editable Project to arrange furniture."))
	_selection_changed()

func show_message(message: String) -> void:
	_message.text = message

func _selection_changed() -> void:
	for name in ["RotateFurniture", "ReplaceFurniture", "DeleteFurniture"]:
		_edit_buttons[name].disabled = not controller.editing or controller.selected_id.is_empty()

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
		"UndoLayout": undo_requested.emit(); return
		"RedoLayout": redo_requested.emit(); return
		"SaveProject": _save.popup_centered_ratio(0.8); return
		"ExportScene": _export.popup_centered_ratio(0.8); return
	command_requested.emit(command)

func configure(data: Dictionary, camera_controller) -> void:
	controller = camera_controller
	# Containers report intermediate wrapped heights before their widths settle.
	get_node("Toolbar").resized.connect(func(): _frame_view.call_deferred())
	controller.furniture_selected.connect(func(_id: String): _selection_changed())
	controller.furniture_moved.connect(func(id: String, point: Vector2): command_requested.emit({ "type": "move", "floorId": controller.floor_id, "id": id, "position": { "x": point.x * 100, "y": point.y * 100 } }))
	controller.placement_blocked.connect(func(): show_message("Furniture overlaps an obstacle."))
	for floor in data.get("floors", []):
		_floor_ids.append(str(floor["id"]))
		_floor_selector.add_item(str(floor["name"]))
	if not _floor_ids.is_empty():
		_floor_selector.select(0)
	set_editor({}, false, false, false, false)

func _frame_view() -> void:
	controller.inset_top = get_node("Toolbar").size.y
	controller.fit_floor()

func cancel_drag() -> void:
	controller.cancel_drag()
