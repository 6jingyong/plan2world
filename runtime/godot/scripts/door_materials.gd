extends ConfirmationDialog

const UI:=preload("res://scripts/runtime_ui.gd")
signal command_requested(command:Dictionary)
var _doors:Array=[]
var _selector:OptionButton
var _material:OptionButton

func _ready() -> void:
	name="DoorMaterials";title="Door appearance";theme=UI.theme();ok_button_text="Apply appearance";min_size=Vector2i(450,220);exclusive=true;process_mode=Node.PROCESS_MODE_ALWAYS
	var form:=VBoxContainer.new();add_child(form)
	form.add_child(UI.label("Choose a door and its surface",18))
	_selector=OptionButton.new();_selector.name="AppearanceDoor";form.add_child(_selector)
	_selector.item_selected.connect(_choose)
	_material=OptionButton.new();_material.name="DoorMaterial";form.add_child(_material)
	for label in ["Wood","Glass","Metal / security-door appearance"]:_material.add_item(label)
	var note:=UI.label("Appearance keeps the same opening size and door movement.",13);note.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;form.add_child(note)
	confirmed.connect(func():
		var door:Dictionary=_doors[_selector.selected]
		command_requested.emit({"type":"door-material","floorId":door["floorId"],"id":door["id"],"material":["wood","glass","steel"][_material.selected]}))

func show_doors(doors:Array,floor_id:String,selected_id:="") -> void:
	_doors=doors.filter(func(d):return d["floorId"]==floor_id);_selector.clear();var chosen:=0
	for i in range(_doors.size()):
		_selector.add_item(_doors[i]["id"])
		if _doors[i]["id"]==selected_id:chosen=i
	if _doors.is_empty():return
	_selector.select(chosen);_choose(chosen);popup_centered()

func _choose(index:int) -> void:
	_material.select(maxi(0,["wood","glass","steel"].find(_doors[index].get("material","wood"))))
