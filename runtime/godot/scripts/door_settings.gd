extends ConfirmationDialog

const UI:=preload("res://scripts/runtime_ui.gd")
signal command_requested(command:Dictionary)
var _doors:Array=[]
var _door:Dictionary={}
var _configuration:Variant=null
var _selector:OptionButton
var _preset:OptionButton
var _ratio:SpinBox
var _rows:VBoxContainer
var _note:Label

func _ready() -> void:
	name="DoorSettings";title="Door panels";theme=UI.theme();ok_button_text="Apply panels";min_size=Vector2i(660,440);exclusive=true
	var form:=VBoxContainer.new();add_child(form)
	_selector=OptionButton.new();_selector.name="DoorSelector";form.add_child(_selector)
	_selector.item_selected.connect(func(index:int):_choose(index))
	_note=UI.label("Author settings · widths, centres, tracks and signed travel in cm.\nAlong A→B; positive track is toward the wall's left side.",14,UI.MUTED);form.add_child(_note)
	_preset=OptionButton.new();_preset.name="DoorPreset";form.add_child(_preset)
	_preset.item_selected.connect(func(index:int):
		_configuration=(_door["configuration"].duplicate(true) if _door["configuration"] is Dictionary else null) if index==0 else _door["presets"][index-1]["configuration"].duplicate(true)
		_draw())
	_ratio=SpinBox.new();_ratio.name="FirstLeafPercent";_ratio.min_value=1;_ratio.max_value=99;_ratio.suffix="% first leaf";form.add_child(_ratio)
	_ratio.value_changed.connect(func(value:float):_configuration={"kind":"paired","firstLeafRatio":value/100})
	var scroll:=ScrollContainer.new();scroll.custom_minimum_size=Vector2(640,220);form.add_child(scroll)
	_rows=VBoxContainer.new();_rows.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(_rows)
	form.add_child(UI.button("Add panel","AddDoorPanel",func():
		if not _configuration is Dictionary or _configuration.get("kind")!="sliding":return
		if _configuration["leaves"].size()>=16:return
		var ids:Array=_configuration["leaves"].map(func(leaf):return leaf["id"]);var index:=1
		while ids.has("panel-%d"%index):index+=1
		_configuration["leaves"].append({"id":"panel-%d"%index,"width":_door["width"]/2,"center":0,"track":12,"motion":"slide","travel":-_door["width"]/2});_draw()))
	form.add_child(UI.button("Reset default","ResetDoorPanels",func():_configuration=null;_draw()))
	confirmed.connect(func():command_requested.emit({"type":"door-leaves","floorId":_door["floorId"],"id":_door["id"],"configuration":_configuration}))

func show_doors(doors:Array,floor_id:String) -> void:
	_doors=doors.filter(func(door):return door["floorId"]==floor_id)
	_selector.clear()
	for door in _doors:_selector.add_item("%s · %s · %.1f cm"%[door["id"],door["type"],door["width"]])
	if _doors.is_empty():return
	_choose(0);popup_centered()

func _choose(index:int) -> void:
	_door=_doors[index];_configuration=_door["configuration"].duplicate(true) if _door["configuration"] is Dictionary else null
	_preset.clear();_preset.add_item("Current panels" if _configuration is Dictionary else "Legacy default")
	for preset in _door["presets"]:_preset.add_item(preset["label"])
	_draw()

func _draw() -> void:
	for child in _rows.get_children():_rows.remove_child(child);child.queue_free()
	var paired:bool=_door["type"] in ["double","french"]
	_ratio.visible=paired;_preset.visible=not paired
	find_child("AddDoorPanel",true,false).visible=not paired and _configuration is Dictionary
	if paired:
		_ratio.set_value_no_signal(_configuration["firstLeafRatio"]*100 if _configuration is Dictionary else 50)
		return
	if not _configuration is Dictionary:return
	for leaf in _configuration["leaves"]:
		var row:=HBoxContainer.new();_rows.add_child(row)
		row.add_child(UI.label(leaf["id"],13))
		for key in ["width","center","track","travel"]:
			var field:=SpinBox.new();field.name=str(leaf["id"])+"_"+key;field.tooltip_text=key+" · cm";field.min_value=-1000000;field.max_value=1000000;field.step=.1;field.value=leaf[key];field.custom_minimum_size.x=100
			field.editable=not (key=="travel" and leaf["motion"]=="fixed")
			field.value_changed.connect(func(value:float):leaf[key]=value)
			var column:=VBoxContainer.new();column.add_child(UI.label(key.capitalize(),12));column.add_child(field);row.add_child(column)
		var fixed:=CheckButton.new();fixed.text="Fixed";fixed.button_pressed=leaf["motion"]=="fixed";row.add_child(fixed)
		fixed.toggled.connect(func(value:bool):leaf["motion"]="fixed" if value else "slide";leaf["travel"]=0 if value else -leaf["width"];_draw())
		row.add_child(UI.button("×","RemovePanel",func():_configuration["leaves"].erase(leaf);_draw()))
