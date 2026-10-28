extends Control

const UI:=preload("res://scripts/runtime_ui.gd")
signal command_requested(command:Dictionary)
signal activity_changed
signal mode_changed
var controller
var session
var mode:=""
var _floor:Dictionary={}
var _points:Array=[]
var _outline:Array=[]
var _request:Dictionary={}
var _accepted:Dictionary={}
var _pointer:=Vector2.ZERO
var _drag:=""
var _ground_id:=""
var _panel:PanelContainer
var _status:Label
var _width:SpinBox
var _height:SpinBox
var _sill:SpinBox
var _apply:Button
var _areas:OptionButton
var _adjust_corners:CheckButton
var _loading:=false
var _revision:=0
var _queued:=false
var _preview_busy:=false

func _ready() -> void:
	name="SpatialAuthoring";mouse_filter=Control.MOUSE_FILTER_IGNORE;set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel=PanelContainer.new();_panel.name="SpatialTools";_panel.add_theme_stylebox_override("panel",UI.box(UI.PAPER,18,12,true));add_child(_panel)
	var column:=VBoxContainer.new();_panel.add_child(column)
	_status=UI.label("",14);_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;_status.custom_minimum_size.x=300;column.add_child(_status)
	_areas=OptionButton.new();_areas.name="GroundAreaChoice";column.add_child(_areas)
	_adjust_corners=CheckButton.new();_adjust_corners.name="AdjustGroundCorners";_adjust_corners.text="Adjust existing corners";column.add_child(_adjust_corners)
	_areas.item_selected.connect(func(index:int):
		_ground_id="";_points=[]
		_adjust_corners.button_pressed=index>0
		if index>0:
			var area:Dictionary=_floor["groundAreas"][index-1];_ground_id=area["id"];_points=area["points"].duplicate(true)
		_invalidate();_schedule();queue_redraw())
	var row:=HBoxContainer.new();column.add_child(row)
	_width=SpinBox.new();_width.name="SpatialOpeningWidth";_width.min_value=1;_width.max_value=10000;_width.step=0;_width.custom_arrow_step=1;_width.suffix="cm";_width.custom_minimum_size.x=150;row.add_child(_width)
	_width.value_changed.connect(func(_v:float):if not _loading:_request["width"]=_width.value;_invalidate();_schedule())
	_height=SpinBox.new();_height.name="SpatialOpeningHeight";_height.min_value=1;_height.max_value=10000;_height.step=0;_height.custom_arrow_step=1;_height.prefix="Height ";_height.suffix="cm";column.add_child(_height)
	_sill=SpinBox.new();_sill.name="SpatialWindowSill";_sill.min_value=0;_sill.max_value=10000;_sill.step=0;_sill.custom_arrow_step=1;_sill.prefix="Sill ";_sill.suffix="cm";column.add_child(_sill)
	_height.value_changed.connect(func(_v:float):if not _loading:_request["height"]=_height.value;_invalidate();_schedule())
	_sill.value_changed.connect(func(_v:float):if not _loading:_request["sillHeight"]=_sill.value;_invalidate();_schedule())
	_apply=UI.button("Confirm","ConfirmSpatialPlacement",_confirm,true);row.add_child(_apply)
	row.add_child(UI.button("Cancel  Esc","CancelSpatialPlacement",cancel))
	row.add_child(UI.button("Last corner","RemoveGroundCorner",func():if not _points.is_empty():_points.pop_back();_invalidate();_schedule();queue_redraw()))
	_width.reparent(column);column.move_child(_width,3);column.move_child(_height,4);column.move_child(_sill,5);column.move_child(row,6)
	_panel.hide()

func configure(camera_controller,layout_session) -> void:
	controller=camera_controller;session=layout_session;queue_redraw()

func _load_floor(state:Dictionary,floor_id:String) -> void:
	_floor={}
	for floor in state.get("authoring",{}).get("floors",[]):
		if floor["id"]==floor_id:_floor=floor;break

func start_ground(state:Dictionary,floor_id:String) -> void:
	cancel();_load_floor(state,floor_id);mode="ground";_points=[];_ground_id=""
	_areas.clear();_areas.add_item("Pave a new ground area")
	_adjust_corners.button_pressed=false
	for area in _floor.get("groundAreas",[]):
		_areas.add_item("Adjust · "+area["name"]);_areas.set_item_disabled(_areas.item_count-1,not area.get("editable",true))
	_setup();_status.text="Click corners · drag a corner to adjust · Confirm to pave."

func start_opening(state:Dictionary,floor_id:String,kind:String,id:String="",choice:Dictionary={}) -> void:
	cancel();_load_floor(state,floor_id);mode=kind
	_request={"type":"opening-placement","floorId":floor_id,"kind":kind,"width":90 if kind=="door" else 120,"height":210 if kind=="door" else 120,"sillHeight":90}
	_request.merge(choice);_request.erase("symbolSvg");_request.erase("label");_request.erase("category");_request.erase("description")
	if not id.is_empty():
		_request["id"]=id
		for opening in _floor.get("openings",[]):
			if opening["id"]==id:_request.merge({"wallId":opening["wallId"],"point":opening["center"],"width":opening["width"],"height":opening["height"],"sillHeight":opening.get("sillHeight",0)});break
	_loading=true;_width.value=_request["width"];_height.value=_request["height"];_sill.value=_request["sillHeight"];_loading=false
	_setup();_status.text="Click a wall · drag the opening or its end handles · Confirm."
	if _request.has("wallId"):_schedule()

func _setup() -> void:
	controller.cancel_drag();controller.editing=false
	mouse_filter=Control.MOUSE_FILTER_STOP;_panel.show();_width.visible=mode!="ground";_areas.visible=mode=="ground"
	_height.visible=mode!="ground";_sill.visible=mode=="window"
	_adjust_corners.visible=mode=="ground"
	_panel.find_child("RemoveGroundCorner",true,false).visible=mode=="ground";_apply.disabled=true
	mode_changed.emit()
	queue_redraw()

func cancel() -> void:
	_revision+=1;mode="";_points=[];_outline=[];_accepted={};_request={};_drag="";_ground_id=""
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	if _panel!=null:_panel.hide()
	if controller!=null:controller.editing=not session.current().is_empty() and not session.busy
	mode_changed.emit()
	queue_redraw()

func _invalidate() -> void:
	_revision+=1;_accepted={};_outline=[];_apply.disabled=true

func _schedule() -> void:
	if _queued:return
	_queued=true
	await get_tree().create_timer(.15,true,false,true).timeout
	_queued=false
	if mode.is_empty():return
	if _preview_busy or session.busy:_schedule();return
	var command:Dictionary
	if mode=="ground":
		if _points.size()<3:return
		command={"type":"floor-area-add" if _ground_id.is_empty() else "floor-area-update","floorId":_floor["id"],"points":_points.duplicate(true)}
		if not _ground_id.is_empty():command["id"]=_ground_id
	else:
		if not _request.has("wallId"):return
		command=_request.duplicate(true)
	var revision:=_revision;_preview_busy=true;_status.text="Checking placement…"
	activity_changed.emit()
	var result:Dictionary=await session.spatial_preview(command);_preview_busy=false;activity_changed.emit()
	if revision!=_revision or mode.is_empty():return
	if result.get("ok",false):
		_accepted=result["preview"]["command"];_outline=result["preview"]["outline"];_apply.disabled=false
		if mode!="ground":_request["point"]=result["preview"]["center"]
		_status.text="Ready · Confirm to pave. Outer edges stay closed." if mode=="ground" else "Ready · drag to adjust, or Confirm."
	else:_status.text=result.get("error","Placement unavailable.")
	queue_redraw()

func _confirm() -> void:
	if _accepted.is_empty() or session.busy:return
	var command:=_accepted.duplicate(true);cancel();command_requested.emit(command)

func _point(screen:Vector2) -> Dictionary:
	var p=controller._plane_point(screen)
	return {} if p==null else {"x":p.x*100,"y":p.z*100}

func _screen(p:Dictionary) -> Vector2:
	return controller.camera.unproject_position(Vector3(p["x"]*.01,controller._floor_y,p["y"]*.01))

func _nearest_wall(screen:Vector2) -> String:
	var best:="";var distance:=18.0
	for wall in _floor.get("walls",[]):
		if wall.get("boundaryType","solid")!="solid":continue
		for i in range(wall["points"].size()-1):
			var p:=Geometry2D.get_closest_point_to_segment(screen,_screen(wall["points"][i]),_screen(wall["points"][i+1]));var d:=p.distance_to(screen)
			if d<distance:best=wall["id"];distance=d
	return best

func _gui_input(event:InputEvent) -> void:
	if mode.is_empty() or controller.transitioning:return
	if (event is InputEventMouseButton and event.button_index in [MOUSE_BUTTON_MIDDLE,MOUSE_BUTTON_RIGHT,MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]) or (event is InputEventMouseMotion and controller._panning):
		controller._unhandled_input(event);accept_event();return
	if event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT:
		var point:=_point(event.position);if point.is_empty():return
		if event.pressed:
			if mode=="ground":
				_drag=""
				if _adjust_corners.button_pressed:
					for i in range(_points.size()):
						if _screen(_points[i]).distance_to(event.position)<12:_drag=str(i);break
				else:_points.append(point)
			else:
				_drag="center"
				if _outline.size()>1 and event.position.distance_to(_screen(_outline[0]))<12:_drag="width"
				elif _outline.size()>1 and event.position.distance_to(_screen(_outline[-1]))<12:_drag="width"
				else:
					var wall:=_nearest_wall(event.position)
					if not wall.is_empty():_request["wallId"]=wall;_request["point"]=point
			_invalidate();queue_redraw()
		else:_drag="";_schedule()
		accept_event()
	elif event is InputEventMouseMotion:
		_pointer=event.position
		if event.button_mask&MOUSE_BUTTON_MASK_LEFT and not _drag.is_empty():
			var point:=_point(event.position);if point.is_empty():return
			if mode=="ground":_points[int(_drag)]=point
			elif _drag=="width" and _request.has("point"):
				var center:Dictionary=_request["point"];_loading=true;_width.value=maxf(1,Vector2(point["x"]-center["x"],point["y"]-center["y"]).length()*2);_loading=false;_request["width"]=_width.value
			else:
				var wall:=_nearest_wall(event.position)
				if not wall.is_empty():_request["wallId"]=wall;_request["point"]=point
			_invalidate()
		queue_redraw()

func _input(event:InputEvent) -> void:
	if not mode.is_empty() and event.is_action_pressed("layout_cancel"):cancel();get_viewport().set_input_as_handled()

func _process(_delta:float) -> void:
	if controller==null or not controller.active:return
	_panel.size=Vector2(minf(380,size.x*.46),0)
	_panel.position=Vector2(size.x-_panel.size.x-16,100)
	queue_redraw()

func _draw() -> void:
	if controller==null or not controller.active:return
	# Read-only compiler guards and canonical author marks; no copied scene model.
	for collider in controller.data.get("colliders",[]):
		if collider.get("purpose")!="perimeter" or collider["floorId"]!=controller.floor_id:continue
		var c:Array=collider["center"];var half:float=collider["size"][0]*.5;var yaw:float=collider["yawClockwiseRadians"]
		var a:=Vector3(c[0]-cos(yaw)*half,controller._floor_y,c[2]-sin(yaw)*half);var b:=Vector3(c[0]+cos(yaw)*half,controller._floor_y,c[2]+sin(yaw)*half)
		draw_dashed_line(controller.camera.unproject_position(a),controller.camera.unproject_position(b),Color("338f9d"),1.5,7)
	var floor:Dictionary={}
	for value in session.current().get("authoring",{}).get("floors",[]):
		if value["id"]==controller.floor_id:floor=value;break
	var marked:=false
	for wall in floor.get("walls",[]):
		if not wall.get("authorModified",false):continue
		marked=true;var points:Array=wall["points"]
		for i in range(points.size()-1):draw_dashed_line(_screen(points[i]),_screen(points[i+1]),Color("cd8739"),4,6)
		var p:=_screen(points[points.size()/2]);draw_rect(Rect2(p-Vector2(4,4),Vector2(8,8)),Color("cd8739"))
	if marked:draw_string(ThemeDB.fallback_font,Vector2(110,94),"Amber: manually corrected wall · protected",HORIZONTAL_ALIGNMENT_LEFT,-1,14,Color("a26826"))
	var shape:Array=_points if mode=="ground" else _outline
	var points:=PackedVector2Array();for p in shape:points.append(_screen(p))
	var color:=Color("397b67") if not _accepted.is_empty() else Color("d18b37")
	if mode=="ground" and points.size()>=3:
		var triangles:=Geometry2D.triangulate_polygon(points)
		if not triangles.is_empty():draw_colored_polygon(points,Color(color,.18))
	if points.size()>1:
		draw_polyline(points,color,5,true)
		if mode=="ground":draw_line(points[-1],points[0],color,2,true)
	for p in points:
		if mode=="ground" or p==points[0] or p==points[-1]:draw_circle(p,6,color)
	if not mode.is_empty() and points.is_empty() and _request.has("point"):draw_circle(_screen(_request["point"]),9,color)
