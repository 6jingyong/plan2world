extends CanvasLayer

const UI:=preload("res://scripts/runtime_ui.gd")
signal command_requested(command:Dictionary)
signal closed
var dialog:ConfirmationDialog
var _enabled:CheckBox
var _lumens:SpinBox
var _temperature:SpinBox
var _entity:Dictionary

func _ready() -> void:
	name="LightSettings";layer=8;process_mode=Node.PROCESS_MODE_ALWAYS
	dialog=ConfirmationDialog.new();dialog.name="LightDialog";dialog.title="Ceiling light";dialog.theme=UI.theme();dialog.ok_button_text="Apply light"
	var form:=VBoxContainer.new();form.custom_minimum_size.x=340;dialog.add_child(form)
	form.add_child(UI.label("Light output",22))
	_enabled=CheckBox.new();_enabled.name="LightEnabled";_enabled.text="Light on";form.add_child(_enabled)
	form.add_child(UI.label("Brightness · lumens",14))
	_lumens=SpinBox.new();_lumens.name="Lumens";_lumens.min_value=0;_lumens.max_value=20000;_lumens.step=50;form.add_child(_lumens)
	form.add_child(UI.label("Colour temperature · warm 2700 K / cool 6500 K",14))
	_temperature=SpinBox.new();_temperature.name="Temperature";_temperature.min_value=2000;_temperature.max_value=10000;_temperature.step=100;_temperature.suffix="K";form.add_child(_temperature)
	var note:=UI.label("The light stays attached to its ceiling. Any unplaced movement is cancelled before changing light settings.",14,UI.MUTED);note.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;note.custom_minimum_size.x=340;form.add_child(note)
	dialog.confirmed.connect(func():
		command_requested.emit({"type":"light","floorId":_entity["floorId"],"id":_entity["id"],"light":{"enabled":_enabled.button_pressed,"lumens":_lumens.value,"temperatureKelvin":_temperature.value}}))
	dialog.visibility_changed.connect(func():
		if not dialog.visible:closed.emit())
	add_child(dialog)

func show_light(entity:Dictionary) -> void:
	_entity=entity;_enabled.button_pressed=entity["light"]["enabled"];_lumens.value=entity["light"]["lumens"];_temperature.value=entity["light"]["temperatureKelvin"]
	dialog.popup_centered()
