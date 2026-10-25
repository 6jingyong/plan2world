extends PanelContainer

const UI := preload("res://scripts/runtime_ui.gd")
signal piece_chosen(index: int)
signal close_requested
signal place_requested
var items: Array = []
var selected_index := -1
var list: ItemList
var place: Button
var _tabs: TabBar
var _search: LineEdit
var _categories: Array[String] = ["All"]
var _visible_indices: Array[int] = []
var _textures := {}
var _title: Label
var _description: Label
var _empty: Label
var _enabled := false
var _ceiling := false

func _ready() -> void:
	name = "FurnitureCatalog"
	add_theme_stylebox_override("panel", UI.box(UI.PAPER,24,12,true))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	add_child(column)
	var heading := HBoxContainer.new()
	column.add_child(heading)
	var title := UI.label("Furniture", 23)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(title)
	heading.add_child(UI.button("Close", "CloseCatalog", func(): close_requested.emit()))
	_search = LineEdit.new()
	_search.name = "SearchFurniture"
	_search.placeholder_text = "Search your furniture…"
	_search.clear_button_enabled = true
	_search.text_changed.connect(func(_text): _filter())
	column.add_child(_search)
	_tabs = TabBar.new()
	_tabs.name = "FurnitureCategories"
	_tabs.scrolling_enabled = true
	_tabs.clip_tabs = true
	_tabs.max_tab_width = 132
	_tabs.add_tab("All")
	_tabs.tab_changed.connect(func(_index): _filter())
	column.add_child(_tabs)
	list = ItemList.new()
	list.name = "FurniturePieces"
	list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list.custom_minimum_size.y = 48
	list.add_theme_font_size_override("font_size",14)
	list.max_columns = 3
	list.fixed_column_width = 96
	list.same_column_width = true
	list.icon_mode = ItemList.ICON_MODE_TOP
	list.fixed_icon_size = Vector2i(64, 64)
	list.max_text_lines = 2
	list.item_selected.connect(func(index: int): choose(_visible_indices[index]))
	list.item_activated.connect(func(index: int):
		if _enabled: choose(_visible_indices[index]); place_requested.emit())
	_search.text_submitted.connect(func(_text): list.grab_focus())
	column.add_child(list)
	_empty = UI.label("No matching pieces", 14, UI.MUTED)
	_empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_empty)
	_title = UI.label("Choose a piece", 17)
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_title)
	_description = UI.label("", 12, UI.MUTED)
	_description.tooltip_text = "Width × depth × height. Preview is an illustration."
	column.add_child(_description)
	place = UI.button("Add at view centre", "AddFurniture", func(): place_requested.emit(), true)
	column.add_child(place)

func configure(catalog: Array) -> void:
	items = catalog
	set_ceiling_layer(_ceiling)

func set_ceiling_layer(value:bool) -> void:
	_ceiling=value;_search.clear();_categories=["All"];_tabs.set_block_signals(true)
	while _tabs.tab_count>0:_tabs.remove_tab(_tabs.tab_count-1)
	_tabs.add_tab("All")
	for item in items:
		if (item.get("mounting")=="ceiling")!=_ceiling:continue
		var category := str(item["category"])
		if not _categories.has(category):
			_categories.append(category)
			_tabs.add_tab(category)
	_tabs.set_block_signals(false);_filter()

func set_editable(enabled: bool) -> void:
	_enabled = enabled
	_search.editable = enabled
	list.mouse_filter = Control.MOUSE_FILTER_STOP if enabled else Control.MOUSE_FILTER_IGNORE
	for index in range(_tabs.tab_count): _tabs.set_tab_disabled(index, not enabled)
	place.disabled = not enabled or selected_index < 0

func _texture(index: int) -> Texture2D:
	if not _textures.has(index):
		var picture := Image.new()
		var error := picture.load_svg_from_string(items[index]["symbolSvg"])
		assert(error == OK, "Shared catalog symbol must be valid SVG")
		_textures[index] = ImageTexture.create_from_image(picture)
	return _textures[index]

func _filter() -> void:
	list.clear()
	_visible_indices.clear()
	var text := _search.text.strip_edges().to_lower()
	for index in range(items.size()):
		var item: Dictionary = items[index]
		if (item.get("mounting")=="ceiling")!=_ceiling:continue
		if _tabs.current_tab > 0 and item["category"] != _categories[_tabs.current_tab]: continue
		if not text.is_empty() and not str(item["label"]).to_lower().contains(text): continue
		_visible_indices.append(index)
		list.add_item(item["label"], _texture(index))
		list.set_item_tooltip(list.item_count - 1, "%s · %s" % [item["label"], item["category"]])
	_empty.visible = _visible_indices.is_empty()
	if _visible_indices.is_empty():
		selected_index = -1
		_title.text = "No piece selected"
		_description.text = "Try another category or search."
		place.disabled = true
		piece_chosen.emit(-1)
	else:
		choose(selected_index if _visible_indices.has(selected_index) else _visible_indices[0])

func choose(index: int) -> void:
	selected_index = index
	var item: Dictionary = items[index]
	_title.text = item["label"]
	var size: Array = item["dimensions"]
	_description.text = "%s × %s × %s cm" % [size[0], size[1], size[2]]
	var visible_index := _visible_indices.find(index)
	if visible_index >= 0:
		list.select(visible_index)
		list.ensure_current_is_visible()
	place.disabled = not _enabled
	piece_chosen.emit(index)
