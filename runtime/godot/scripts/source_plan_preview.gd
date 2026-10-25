extends Control

signal door_selected(index: int)
var texture: Texture2D
var doors: Array=[]
var selected := -1
var side := 1

func image_rect() -> Rect2:
	if texture==null: return Rect2()
	var image_size := Vector2(texture.get_size())
	var fitted := image_size * minf(size.x/image_size.x,size.y/image_size.y)
	return Rect2((size-fitted)*.5,fitted)

func _draw() -> void:
	if texture==null: return
	var rect := image_rect()
	draw_texture_rect(texture,rect,false)
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
	if not event is InputEventMouseButton or not event.pressed or event.button_index!=MOUSE_BUTTON_LEFT:return
	var rect := image_rect()
	for index in range(doors.size()):
		if not doors[index].has("sourcePoint"):continue
		var point: Array=doors[index]["sourcePoint"]
		if event.position.distance_to(rect.position+Vector2(point[0],point[1])*rect.size)<18:
			door_selected.emit(index);accept_event();return
