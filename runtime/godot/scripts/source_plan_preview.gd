extends Control

signal door_selected(index: int)
signal corners_changed(points: Array)
var texture: Texture2D
var doors: Array=[]
var selected := -1
var side := 1
var editing_corners := false
var corners: Array = [Vector2.ZERO,Vector2(1,0),Vector2.ONE,Vector2(0,1)]
var _drag_corner := -1
var _selected_corner := 0

func image_rect() -> Rect2:
	if texture==null: return Rect2()
	var image_size := Vector2(texture.get_size())
	var fitted := image_size * minf(size.x/image_size.x,size.y/image_size.y)
	return Rect2((size-fitted)*.5,fitted)

func _draw() -> void:
	if texture==null: return
	var rect := image_rect()
	draw_texture_rect(texture,rect,false)
	if editing_corners:
		var points:=PackedVector2Array()
		for point in corners:points.append(rect.position+point*rect.size)
		for index in range(4):
			draw_line(points[index],points[(index+1)%4],Color("397b67"),3,true)
			draw_circle(points[index],10,Color.WHITE)
			draw_arc(points[index],10,0,TAU,24,Color("174e40"),3,true)
			draw_string(ThemeDB.fallback_font,points[index]+Vector2(12,18),["TL","TR","BR","BL"][index],HORIZONTAL_ALIGNMENT_LEFT,-1,14,Color("174e40"))
		return
	for index in range(doors.size()):
		if not doors[index].has("sourcePoint"):continue
		var point: Array=doors[index]["sourcePoint"]
		var center := rect.position+Vector2(point[0],point[1])*rect.size
		draw_circle(center,13,Color("397b67") if selected==index else Color("314b43"))
		draw_string(ThemeDB.fallback_font,center+Vector2(-5,5),str(index+1),HORIZONTAL_ALIGNMENT_LEFT,-1,14,Color.WHITE)
		if selected==index:
			var inward: Array=doors[index]["inwardLeft"]
			var direction := (Vector2(inward[0],inward[1])*rect.size/Vector2(texture.get_size())).normalized()*side
			draw_line(center,center+direction*40,Color("397b67"),4,true)
			draw_circle(center+direction*40,5,Color("397b67"))

func _gui_input(event: InputEvent) -> void:
	if editing_corners:
		var rect:=image_rect()
		if event is InputEventKey and event.pressed and event.keycode in [KEY_LEFT,KEY_RIGHT,KEY_UP,KEY_DOWN]:
			var direction:=Vector2(-1,0) if event.keycode==KEY_LEFT else Vector2(1,0) if event.keycode==KEY_RIGHT else Vector2(0,-1) if event.keycode==KEY_UP else Vector2(0,1)
			corners[_selected_corner]=(corners[_selected_corner]+direction*(.01 if event.shift_pressed else .001)).clamp(Vector2.ZERO,Vector2.ONE)
			corners_changed.emit(corners.duplicate());queue_redraw();accept_event();return
		if event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT:
			if not event.pressed:_drag_corner=-1;return
			for index in range(4):
				if event.position.distance_to(rect.position+corners[index]*rect.size)<20:_drag_corner=index;_selected_corner=index;grab_focus();accept_event();return
		if event is InputEventMouseMotion and _drag_corner>=0 and rect.size.x>0 and rect.size.y>0:
			corners[_drag_corner]=((event.position-rect.position)/rect.size).clamp(Vector2.ZERO,Vector2.ONE)
			corners_changed.emit(corners.duplicate());queue_redraw();accept_event()
		return
	if not event is InputEventMouseButton or not event.pressed or event.button_index!=MOUSE_BUTTON_LEFT:return
	var rect := image_rect()
	for index in range(doors.size()):
		if not doors[index].has("sourcePoint"):continue
		var point: Array=doors[index]["sourcePoint"]
		if event.position.distance_to(rect.position+Vector2(point[0],point[1])*rect.size)<18:
			door_selected.emit(index);accept_event();return
