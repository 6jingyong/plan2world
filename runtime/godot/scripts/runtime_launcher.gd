extends CanvasLayer

signal scene_selected(path: String)
signal project_selected(path: String)
signal resume_requested
signal respawn_requested

var _screen: Control
var _resume: Button
var _return: Button
var _message: Label
var _dialog: FileDialog

func _ready() -> void:
	name = "SceneMenu"
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	_screen = Control.new()
	_screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_screen)
	var background := ColorRect.new()
	background.color = Color("17212f")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_screen.add_child(background)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_screen.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size.x = 620
	center.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 24)
	panel.add_child(margin)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 16)
	margin.add_child(content)
	var title := Label.new()
	title.text = "Plan2World Runtime"
	title.add_theme_font_size_override("font_size", 28)
	content.add_child(title)
	var help := Label.new()
	help.text = "Open a compiled runtime scene to explore, or a native Project to arrange furniture.\nFor runtime ZIPs, extract and keep the JSON, GLB and assets together."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(help)
	var open := Button.new()
	open.name = "OpenScene"
	open.text = "Open runtime scene…"
	open.custom_minimum_size.y = 44
	open.pressed.connect(func(): _dialog.popup_centered_ratio(0.8))
	content.add_child(open)
	var edit := Button.new()
	edit.name = "OpenProject"
	edit.text = "Open editable Project…"
	edit.custom_minimum_size.y = 44
	content.add_child(edit)
	var project_dialog := FileDialog.new()
	project_dialog.name = "ProjectPicker"
	project_dialog.title = "Open Project for furniture layout"
	project_dialog.access = FileDialog.ACCESS_FILESYSTEM
	project_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	project_dialog.filters = PackedStringArray(["*.json ; Native Project", "*.zip ; Project package"])
	project_dialog.use_native_dialog = true
	project_dialog.file_selected.connect(func(path: String): project_selected.emit(path))
	add_child(project_dialog)
	edit.pressed.connect(func(): project_dialog.popup_centered_ratio(0.8))
	_resume = Button.new()
	_resume.name = "Resume"
	_resume.text = "Resume"
	_resume.custom_minimum_size.y = 44
	_resume.pressed.connect(func(): resume_requested.emit())
	content.add_child(_resume)
	_return = Button.new()
	_return.name = "ReturnToStart"
	_return.text = "Return to start"
	_return.custom_minimum_size.y = 44
	_return.pressed.connect(func(): respawn_requested.emit())
	content.add_child(_return)
	_message = Label.new()
	_message.name = "Message"
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_message.modulate = Color("fecaca")
	content.add_child(_message)
	var controls := Label.new()
	controls.text = "WASD move · E door · Esc mouse · F2 top view · F1 scene menu"
	controls.add_theme_font_size_override("font_size", 14)
	content.add_child(controls)
	_dialog = FileDialog.new()
	_dialog.name = "ScenePicker"
	_dialog.title = "Open compiled runtime scene"
	_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_dialog.filters = PackedStringArray(["*.json ; Plan2World runtime scene"])
	_dialog.use_native_dialog = true
	_dialog.file_selected.connect(func(path: String): scene_selected.emit(path))
	add_child(_dialog)

func show_menu(can_resume: bool, message: String = "") -> void:
	_screen.show()
	_resume.visible = can_resume
	_return.visible = can_resume
	_message.text = message
	_message.visible = not message.is_empty()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func hide_menu() -> void:
	_screen.hide()
	_dialog.hide()

func set_busy(busy: bool) -> void:
	for name in ["OpenScene", "OpenProject", "Resume", "ReturnToStart"]:
		find_child(name, true, false).disabled = busy
