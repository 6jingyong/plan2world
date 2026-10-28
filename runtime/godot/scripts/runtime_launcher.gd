extends CanvasLayer

const UI := preload("res://scripts/runtime_ui.gd")

signal scene_selected(path: String)
signal project_selected(path: String)
signal resume_requested
signal respawn_requested
signal authoring_requested(page: int)
signal correction_requested(path:String)
signal object_edit_requested

var _screen: Control
var _resume: Button
var _return: Button
var _message: Label
var _dialog: FileDialog
var _correction:Button
var _correction_path:=""

func _ready() -> void:
	name = "SceneMenu"
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	_screen = Control.new()
	_screen.theme = UI.theme()
	_screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_screen)
	var background := ColorRect.new()
	background.color = Color("e4ecdf")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_screen.add_child(background)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_screen.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size.x = 580
	center.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 24)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(margin)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 16)
	margin.add_child(content)
	var title := Label.new()
	content.add_child(UI.label("PLAN2WORLD  /  WELCOME HOME", 13, UI.LEAF))
	title.text = "A space to make your own."
	title.add_theme_font_size_override("font_size", 30)
	content.add_child(title)
	var help := Label.new()
	help.text = "Walk through your home, or settle in and arrange a few things. Pick up where you left off with a saved Project."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(help)
	content.add_child(UI.button("Create from a floor plan…", "CreateFromImage", func():authoring_requested.emit(1), true))
	var account_help:=HBoxContainer.new();content.add_child(account_help)
	account_help.add_child(UI.button("AI account…","AIAccount",func():authoring_requested.emit(0)))
	account_help.add_child(UI.button("How to use…","UserGuide",func():authoring_requested.emit(2)))
	var open := UI.button("Explore a scene…", "OpenScene", func(): _dialog.popup_centered_ratio(0.8))
	open.custom_minimum_size.y = 44
	content.add_child(open)
	var edit := UI.button("Arrange a Project…", "OpenProject", func(): get_node("ProjectPicker").popup_centered_ratio(0.8), true)
	edit.custom_minimum_size.y = 44
	content.add_child(edit)
	content.add_child(UI.button("Correct walls and openings…","CorrectProject",func():get_node("CorrectionPicker").popup_centered_ratio(.8)))
	content.add_child(UI.button("Modify selected object…","ModifySelection",func():object_edit_requested.emit()))
	var project_dialog := FileDialog.new()
	project_dialog.name = "ProjectPicker"
	project_dialog.title = "Open Project for furniture layout"
	project_dialog.access = FileDialog.ACCESS_FILESYSTEM
	project_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	project_dialog.filters = PackedStringArray(["*.json ; Native Project", "*.zip ; Project package"])
	project_dialog.use_native_dialog = true
	project_dialog.file_selected.connect(func(path: String): project_selected.emit(path))
	add_child(project_dialog)
	var correction:=FileDialog.new();correction.name="CorrectionPicker";correction.title="Open a Project for wall correction";correction.access=FileDialog.ACCESS_FILESYSTEM;correction.file_mode=FileDialog.FILE_MODE_OPEN_FILE;correction.filters=project_dialog.filters;correction.use_native_dialog=true
	correction.file_selected.connect(func(path:String):correction_requested.emit(path));add_child(correction)
	_resume = UI.button("Back to your space", "Resume", func(): resume_requested.emit(), true)
	_resume.custom_minimum_size.y = 44
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
	_message.add_theme_color_override("font_color", UI.AMBER)
	content.add_child(_message)
	_correction=UI.button("Open this Project for correction…","RecoverProject",func():correction_requested.emit(_correction_path))
	_correction.hide();content.add_child(_correction)
	var controls := UI.label("WASD to wander   ·   F2 to arrange   ·   F1 to pause", 13, UI.MUTED)
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
	var fit := func():
		panel.custom_minimum_size = Vector2(minf(580, _screen.size.x - 48), minf(content.get_combined_minimum_size().y + 84, _screen.size.y - 48))
	_screen.resized.connect(func(): fit.call_deferred())
	content.minimum_size_changed.connect(func(): fit.call_deferred())
	fit.call_deferred()

func show_menu(can_resume: bool, message: String = "", preserve_recovery:=false) -> void:
	if not preserve_recovery:_correction_path="";_correction.hide()
	_screen.show()
	_resume.visible = can_resume
	_return.visible = can_resume
	_message.text = message
	_message.visible = not message.is_empty()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if can_resume: _resume.grab_focus()
	else: find_child("OpenProject", true, false).grab_focus()

func hide_menu() -> void:
	_screen.hide()
	_dialog.hide()

func offer_correction(recovery:Dictionary) -> void:
	_correction_path=str(recovery.get("projectPath","")) if recovery.get("kind")=="edit-project" else ""
	_correction.visible=not _correction_path.is_empty()

func set_busy(busy: bool) -> void:
	for name in ["OpenScene", "OpenProject", "Resume", "ReturnToStart", "CreateFromImage", "AIAccount", "UserGuide", "CorrectProject", "ModifySelection", "RecoverProject"]:
		find_child(name, true, false).disabled = busy
