extends Control

signal selected(kind:String,id:String)
signal wall_modified(id:String,start:Dictionary,finish:Dictionary)
signal wall_drawn(start:Dictionary,finish:Dictionary)
var floor:Dictionary={}
var selected_id:=""
var drawing:=false
var inward_side:=1
var _texture:Texture2D
var _zoom:=1.0
var _offset:=Vector2.ZERO
var _drag:=""
var _draft_start:Variant=null
var _pointer:=Vector2.ZERO
var _wall:Dictionary={}

func configure(value:Dictionary,selection:="") -> void:
	var first:bool=floor.is_empty() or floor.get("id")!=value["id"]
	floor=value;selected_id=selection;_texture=null
	var bg=floor.get("background")
	if bg is Dictionary and bg.get("dataUrl","").contains(";base64,"):
		var data:=Marshalls.base64_to_raw(str(bg["dataUrl"]).split(";base64,",true,1)[1]);var image:=Image.new();var header:=str(bg["dataUrl"])
		var error:=image.load_png_from_buffer(data) if header.begins_with("data:image/png") else image.load_jpg_from_buffer(data) if header.begins_with("data:image/jpeg") else image.load_webp_from_buffer(data)
		if error==OK:_texture=ImageTexture.create_from_image(image)
	if first:fit_plan()
	queue_redraw()

func fit_plan() -> void:
	var points:Array=[]
	for wall in floor.get("walls",[]):
		for point in wall["points"]:points.append(_v(point))
	var bg=floor.get("background")
	if _texture!=null and bg is Dictionary:
		for corner in [Vector2(-.5,-.5),Vector2(.5,-.5),Vector2(.5,.5),Vector2(-.5,.5)]:points.append(_v(bg["position"])+(corner*Vector2(_texture.get_size())*bg["scale"]).rotated(deg_to_rad(bg["rotation"])))
	if points.is_empty():points=[Vector2.ZERO,Vector2(1000,1000)]
	var lo:Vector2=points[0];var hi:=lo
	for point in points:lo=lo.min(point);hi=hi.max(point)
	var span:Vector2=(hi-lo).max(Vector2(100,100));_zoom=minf(maxf(100,size.x-50)/span.x,maxf(100,size.y-50)/span.y);_offset=size*.5-(lo+hi)*.5*_zoom
	queue_redraw()

func _ready() -> void:
	clip_contents=true;mouse_default_cursor_shape=Control.CURSOR_CROSS;resized.connect(func():if not floor.is_empty():fit_plan())

func _v(p:Dictionary) -> Vector2:return Vector2(p["x"],p["y"])
func _screen(p:Dictionary) -> Vector2:return _v(p)*_zoom+_offset
func _plan(p:Vector2) -> Dictionary:
	var value:Vector2=(p-_offset)/_zoom
	return {"x":snappedf(value.x,1),"y":snappedf(value.y,1)}

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO,size),Color("f2f4ed"))
	var bg=floor.get("background")
	if _texture!=null and bg is Dictionary:
		draw_set_transform(_screen(bg["position"]),deg_to_rad(bg["rotation"]),Vector2.ONE*bg["scale"]*_zoom)
		draw_texture_rect(_texture,Rect2(-Vector2(_texture.get_size())*.5,Vector2(_texture.get_size())),false,Color(1,1,1,clampf(bg.get("opacity",.35),.15,.65)));draw_set_transform(Vector2.ZERO)
	for wall in floor.get("walls",[]):
		var color:=Color("397b67") if wall["id"]==selected_id else Color("314b43")
		var points:PackedVector2Array=[]
		for point in wall["points"]:points.append(_screen(point))
		if _drag!="" and _wall.get("id")==wall["id"]:
			if _drag=="start":points[0]=_pointer
			else:points[points.size()-1]=_pointer
		if points.size()>1:draw_polyline(points,color,clampf(wall["thickness"]*_zoom,3,18),true)
		if wall["id"]==selected_id:
			for point in [points[0],points[points.size()-1]]:draw_circle(point,7,Color("e8b35e"));draw_arc(point,7,0,TAU,20,color,2,true)
	for opening in floor.get("openings",[]):
		var p:=_screen(opening["center"]);var color:=Color("ed792e") if opening["kind"]=="door" else Color("138cc5")
		draw_rect(Rect2(p-Vector2(6,6),Vector2(12,12)),color)
		if opening["id"]==selected_id:
			draw_arc(p,12,0,TAU,24,Color("397b67"),3,true)
			if opening.has("inwardLeft"):
				var direction:=_v(opening["inwardLeft"])*inward_side;draw_line(p,p+direction*34,Color("397b67"),3,true);draw_circle(p+direction*34,4,Color("397b67"))
	for item in floor.get("furniture",[]):
		var p:=_screen(item["position"]);draw_rect(Rect2(p-Vector2(4,4),Vector2(8,8)),Color("8c8496"),false,2)
	for issue in floor.get("issues",[]):
		if issue["resolved"] or not issue.has("position"):continue
		var p:=_screen(issue["position"]);draw_circle(p,10,Color("b84b38"));draw_string(ThemeDB.fallback_font,p+Vector2(-2,5),"!",HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color.WHITE)
	if _draft_start!=null:draw_line(_screen(_draft_start),_pointer,Color("397b67"),4,true)

func _gui_input(event:InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
			var before:Vector2=(event.position-_offset)/_zoom;_zoom=clampf(_zoom*(1.2 if event.button_index==MOUSE_BUTTON_WHEEL_UP else 1/1.2),.005,20);_offset=event.position-before*_zoom;queue_redraw();accept_event();return
		if event.button_index!=MOUSE_BUTTON_LEFT:return
		if not event.pressed:
			if not _drag.is_empty():
				var start:Dictionary=_plan(event.position) if _drag=="start" else _wall["start"]
				var finish:Dictionary=_plan(event.position) if _drag=="end" else _wall["end"]
				_drag="";wall_modified.emit(_wall["id"],start,finish);queue_redraw()
			return
		_pointer=event.position
		if drawing:
			if _draft_start==null:_draft_start=_plan(event.position)
			else:
				var start:Dictionary=_draft_start;_draft_start=null;drawing=false;wall_drawn.emit(start,_plan(event.position))
			queue_redraw();accept_event();return
		for wall in floor.get("walls",[]):
			if wall["id"]!=selected_id:continue
			for key in ["start","end"]:
				if event.position.distance_to(_screen(wall[key]))<12:_wall=wall;_drag=key;accept_event();return
		for issue in floor.get("issues",[]):
			if not issue["resolved"] and issue.has("position") and event.position.distance_to(_screen(issue["position"]))<12:selected.emit("issue",issue["id"]);accept_event();return
		for opening in floor.get("openings",[]):
			if event.position.distance_to(_screen(opening["center"]))<13:selected.emit("opening",opening["id"]);accept_event();return
		var best:="";var distance:=12.0
		for wall in floor.get("walls",[]):
			var points:Array=wall["points"]
			for i in range(points.size()-1):
				var nearest:=Geometry2D.get_closest_point_to_segment(event.position,_screen(points[i]),_screen(points[i+1]));var d:float=nearest.distance_to(event.position)
				if d<distance:distance=d;best=wall["id"]
		if not best.is_empty():selected.emit("wall",best);accept_event();return
		for item in floor.get("furniture",[]):
			if event.position.distance_to(_screen(item["position"]))<10:selected.emit("furniture",item["id"]);accept_event();return
	if event is InputEventMouseMotion:
		_pointer=event.position
		if event.button_mask&MOUSE_BUTTON_MASK_MIDDLE:_offset+=event.relative
		queue_redraw()
