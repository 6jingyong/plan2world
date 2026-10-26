extends RefCounted

# Shared native UI tokens. These resources never participate in scene artifacts.
const INK := Color("314b43")
const MUTED := Color("63756c")
const PAPER := Color("fffdf5")
const LEAF := Color("397b67")
const MINT := Color("e2eee2")
const LINE := Color("d9e0d2")
const AMBER := Color("996238")

static func box(color: Color, radius := 18, padding := 16, shadow := false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.content_margin_left = padding
	style.content_margin_right = padding
	style.content_margin_top = padding
	style.content_margin_bottom = padding
	if shadow:
		style.shadow_color = Color(0.16, 0.24, 0.2, 0.12)
		style.shadow_size = 12
		style.shadow_offset = Vector2(0, 4)
	return style

static func theme() -> Theme:
	var value := Theme.new()
	value.default_font_size = 16
	for type in ["Label", "Button", "OptionButton", "CheckButton", "LineEdit", "PopupMenu", "SpinBox", "ItemList", "TabBar", "TabContainer"]:
		value.set_color("font_color", type, INK)
		value.set_color("font_hover_color", type, INK)
		value.set_color("font_focus_color", type, INK)
		value.set_color("font_pressed_color", type, INK)
		value.set_color("font_disabled_color", type, Color("8c998d"))
	for type in ["Button", "OptionButton", "LineEdit"]:
		value.set_stylebox("normal", type, box(MINT, 12, 10))
		value.set_stylebox("hover", type, box(Color("d2e5d5"), 12, 10))
		value.set_stylebox("pressed", type, box(Color("bcd8c5"), 12, 10))
		value.set_stylebox("disabled", type, box(Color("f0f1e9"), 12, 10))
		var focus := box(Color.TRANSPARENT, 12, 10)
		focus.set_border_width_all(2); focus.border_color = LEAF
		value.set_stylebox("focus", type, focus)
	value.set_color("font_selected_color", "ItemList", INK)
	value.set_color("font_hovered_color", "ItemList", INK)
	value.set_color("font_placeholder_color", "LineEdit", MUTED)
	value.set_color("clear_button_color", "LineEdit", MUTED)
	value.set_color("clear_button_color_pressed", "LineEdit", INK)
	value.set_stylebox("panel", "ItemList", box(Color("f4f5eb"), 14, 6))
	value.set_stylebox("selected", "ItemList", box(Color("c5dfcd"), 12, 6))
	value.set_stylebox("selected_focus", "ItemList", box(Color("b6d5c2"), 12, 6))
	for type in ["TabBar", "TabContainer"]:
		value.set_stylebox("tab_unselected", type, box(MINT, 12, 10))
		value.set_stylebox("tab_selected", type, box(LEAF, 12, 10))
		value.set_color("font_selected_color", type, PAPER)
		value.set_color("font_unselected_color", type, INK)
	value.set_stylebox("panel", "TabContainer", box(PAPER, 12, 8))
	value.set_stylebox("panel", "PanelContainer", box(PAPER, 20, 18, true))
	value.set_stylebox("panel", "PopupMenu", box(PAPER, 12, 12, true))
	value.set_stylebox("hover", "PopupMenu", box(MINT, 8, 8))
	value.set_stylebox("panel", "AcceptDialog", box(PAPER, 20, 20, true))
	value.set_color("font_color", "TooltipLabel", PAPER)
	value.set_stylebox("panel", "TooltipPanel", box(INK, 8, 10))
	var divider := StyleBoxLine.new()
	divider.color = LINE
	divider.thickness = 1
	value.set_stylebox("separator", "HSeparator", divider)
	value.set_constant("separation", "VBoxContainer", 12)
	value.set_constant("separation", "HBoxContainer", 10)
	return value

static func label(text: String, size := 16, color := INK) -> Label:
	var node := Label.new()
	node.text = text
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	return node

static func button(text: String, node_name: String, action: Callable, primary := false) -> Button:
	var node := Button.new()
	node.name = node_name
	node.text = text
	node.custom_minimum_size.y = 42
	node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if primary:
		node.add_theme_color_override("font_focus_color", PAPER)
		for state in ["normal", "hover", "pressed"]:
			node.add_theme_stylebox_override(state, box(LEAF if state == "normal" else Color("2b6856"), 14, 12))
			node.add_theme_color_override("font_color" if state == "normal" else "font_" + state + "_color", PAPER)
	node.pressed.connect(action)
	return node

static func fill(node: Control) -> void:
	node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

static func ignore_pointer(node: Control) -> void:
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in node.get_children():
		if child is Control: ignore_pointer(child)
