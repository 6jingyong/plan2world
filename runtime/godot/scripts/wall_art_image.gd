extends ConfirmationDialog
const UI:=preload("res://scripts/runtime_ui.gd")
signal image_confirmed(image)
var picker:FileDialog
var preview:TextureRect
var status:Label
var rotate:Button
var _image:Image
var _filename:=""

func _ready() -> void:
	name="WallArtImage";title="Artwork image";theme=UI.theme();exclusive=true;transient=true
	ok_button_text="Apply image";size=Vector2i(500,520)
	var column:=VBoxContainer.new();add_child(column)
	column.add_child(UI.button("Choose PNG / JPG…","ChooseArtworkImage",func():picker.popup_centered_ratio(.8)))
	preview=TextureRect.new();preview.custom_minimum_size=Vector2(220,120);preview.size_flags_vertical=Control.SIZE_EXPAND_FILL
	preview.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;preview.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;column.add_child(preview)
	rotate=UI.button("Rotate 90°","RotateArtworkImage",func():if _image!=null:_image.rotate_90(CLOCKWISE);_refresh());column.add_child(rotate)
	status=UI.label("Choose a local picture. Check its direction before applying.",13);status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;status.max_lines_visible=2;column.add_child(status)
	var note:=UI.label("Fits inside the existing frame. Wall, size and placement stay the same.",12,UI.MUTED);note.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;column.add_child(note)
	picker=FileDialog.new();picker.name="ArtworkImagePicker";picker.access=FileDialog.ACCESS_FILESYSTEM;picker.file_mode=FileDialog.FILE_MODE_OPEN_FILE;picker.filters=PackedStringArray(["*.png,*.jpg,*.jpeg ; Artwork images"]);add_child(picker)
	picker.file_selected.connect(select_image)
	confirmed.connect(func():
		if _image!=null:image_confirmed.emit({"pngBase64":Marshalls.raw_to_base64(_image.save_png_to_buffer()),"filename":_filename}))
	visibility_changed.connect(func():if not visible:_image=null;preview.texture=null;_filename="";picker.hide())
	_refresh()

func show_image() -> void:
	_image=null;preview.texture=null;_filename="";_refresh()
	var available:=get_tree().root.get_visible_rect().size
	preview.custom_minimum_size.y=clampf(available.y*.28,100,240)
	size=Vector2i(mini(500,int(available.x)-48),mini(520,int(available.y)-72));popup_centered()

func select_image(path:String) -> void:
	# Read a bounded local file first. Never keep a path in the Project or fetch URLs.
	_image=null;preview.texture=null;_filename="";_refresh()
	var file:=FileAccess.open(path,FileAccess.READ)
	if file==null or file.get_length()>8*1024*1024:status.text="Choose a readable PNG or JPG up to 8 MiB.";return
	var bytes:=file.get_buffer(file.get_length());file.close()
	var dimensions:=_header_size(bytes)
	if dimensions.x<1 or dimensions.y<1 or dimensions.x>4096 or dimensions.y>4096 or dimensions.x*dimensions.y>16000000:status.text="Choose a PNG or JPG up to 4096 pixels per side and 16 million pixels.";return
	var image:=Image.new();var error:int=ERR_FILE_UNRECOGNIZED
	if bytes.size()>=24 and bytes.slice(0,8)==PackedByteArray([137,80,78,71,13,10,26,10]):
		error=image.load_png_from_buffer(bytes)
	elif bytes.size()>2 and bytes[0]==255 and bytes[1]==216:error=image.load_jpg_from_buffer(bytes)
	if error!=OK or image.is_empty():status.text="This picture could not be decoded. Choose a PNG or JPG.";return
	if image.get_width()>4096 or image.get_height()>4096 or image.get_width()*image.get_height()>16000000:status.text="Choose an image up to 4096 pixels per side and 16 million pixels.";return
	if image.save_png_to_buffer().size()>8*1024*1024:status.text="The decoded PNG exceeds 8 MiB. Choose a smaller picture.";return
	_image=image;_filename=path.get_file().left(256);_refresh()

# Decoder allocation guard only, not an architectural interpretation.
func _header_size(bytes:PackedByteArray) -> Vector2i:
	if bytes.size()>=24 and bytes.slice(0,8)==PackedByteArray([137,80,78,71,13,10,26,10]):
		return Vector2i((bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19],(bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23])
	if bytes.size()<4 or bytes[0]!=255 or bytes[1]!=216:return Vector2i.ZERO
	var offset:=2
	while offset+4<=bytes.size() and bytes[offset]==255:
		if bytes[offset+1]==255:offset+=1;continue
		var length:int=(bytes[offset+2]<<8)|bytes[offset+3]
		if length<2 or offset+2+length>bytes.size():return Vector2i.ZERO
		if bytes[offset+1] in [192,193,194] and length>=8:return Vector2i((bytes[offset+7]<<8)|bytes[offset+8],(bytes[offset+5]<<8)|bytes[offset+6])
		offset+=2+length
	return Vector2i.ZERO

func _refresh() -> void:
	get_ok_button().disabled=_image==null;rotate.disabled=_image==null
	if _image!=null:
		preview.texture=ImageTexture.create_from_image(_image)
		status.text="%s · %d × %d · Preview only until Apply image."%[_filename.left(64),_image.get_width(),_image.get_height()];status.tooltip_text=_filename
