extends Window

const UI:=preload("res://scripts/runtime_ui.gd")
const CATALOG:=preload("res://scripts/furniture_catalog_view.gd")
signal command_requested(command:Dictionary)
signal preview_requested(command:Dictionary)
signal geometry_requested(id:String)
signal panels_requested(id:String)
signal light_requested(id:String)
signal closed
var catalog
var target:Dictionary={}
var _panels:Button
var _geometry:Button
var _remove:Button
var _rotate:Button
var _light:Button

func _ready() -> void:
	name="ObjectEditor";title="Modify selected object";theme=UI.theme();process_mode=Node.PROCESS_MODE_ALWAYS;exclusive=true;transient=true
	min_size=Vector2i(380,440);size=Vector2i(440,640);hide()
	catalog=CATALOG.new();catalog.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);add_child(catalog)
	catalog.close_requested.connect(hide);close_requested.connect(hide)
	catalog.place_requested.connect(_confirm)
	_rotate=UI.button("Rotate R","RotateObject",func():_emit({"type":"rotate","rotation":rad_to_deg(target["yawClockwiseRadians"])+90}));catalog.actions.add_child(_rotate)
	_remove=UI.button("Remove","RemoveObject",func():_emit({"type":"remove"}));catalog.actions.add_child(_remove)
	_light=UI.button("Light…","EditObjectLight",func():var id:String=target["id"];hide();light_requested.emit(id));catalog.actions.add_child(_light)
	_geometry=UI.button("Size / position…","EditOpeningGeometry",func():var id:String=target["id"];hide();geometry_requested.emit(id));catalog.actions.add_child(_geometry)
	_panels=UI.button("Panels…","EditOpeningPanels",func():var id:String=target["id"];hide();panels_requested.emit(id));catalog.actions.add_child(_panels)
	visibility_changed.connect(func():if not visible:closed.emit())

func show_object(state:Dictionary,entity:Dictionary) -> void:
	target=entity.duplicate(true)
	var kind:String=entity["kind"];var furniture:=kind=="furniture"
	var choices:Array=state["catalog"] if furniture else state.get("openingCatalog",[]).filter(func(item):return item["kind"]==kind)
	if choices.is_empty():return
	catalog.set_ceiling_layer(furniture and entity.get("movement",{}).get("kind")=="ceiling")
	catalog.configure(choices);catalog.set_editable(true);catalog.set_purpose("Modify "+kind,true)
	var current:Dictionary={}
	for item in state.get("openings",[]):
		if item["id"]==entity["id"]:current=item;break
	for i in range(choices.size()):
		var item:Dictionary=choices[i]
		if (furniture and item["asset"].get("catalogId")==entity.get("catalogId")) or (kind=="door" and item.get("material")==current.get("material","wood")) or (kind=="window" and item.get("windowType")==entity.get("windowType")):
			catalog.reveal(i);break
	_rotate.visible=furniture and entity.get("movement",{}).get("kind") in ["floor","ceiling"]
	_remove.visible=furniture;_light.visible=entity.has("light");_geometry.visible=not furniture
	_panels.visible=kind=="door" and entity.get("doorType") in ["double","french","sliding","pocket"]
	catalog.place.text="Preview replacement" if furniture else "Apply choice"
	var viewport:Vector2=get_tree().root.get_visible_rect().size
	size=Vector2i(mini(440,int(viewport.x)-32),mini(640,int(viewport.y)-48));popup_centered()

func _emit(command:Dictionary) -> void:
	command.merge({"id":target["id"],"floorId":target["floorId"]});hide();command_requested.emit(command)

func _confirm() -> void:
	if catalog.selected_index<0:return
	var choice:Dictionary=catalog.items[catalog.selected_index]
	if target["kind"]=="furniture":
		var command:={"type":"replace","id":target["id"],"floorId":target["floorId"],"asset":choice["asset"]}
		# Exact mount/ceiling choices use the existing native installation flow.
		hide();preview_requested.emit(command)
	elif target["kind"]=="door":_emit({"type":"door-material","material":choice["material"]})
	else:_emit({"type":"window-style","windowType":choice["windowType"]})

func _input(event:InputEvent) -> void:
	if not visible:return
	if event.is_action_pressed("layout_cancel"):
		hide();get_viewport().set_input_as_handled()
