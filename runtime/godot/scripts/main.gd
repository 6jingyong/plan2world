extends Node3D

const UI := preload("res://scripts/runtime_ui.gd")
const RUNTIME_ARTIFACTS := preload("res://scripts/runtime_artifacts.gd")
const RUNTIME_LOADER := preload("res://scripts/runtime_loader.gd")
const RUNTIME_ASSET_RENDERER := preload("res://scripts/runtime_asset_renderer.gd")
const RUNTIME_PROXY_RENDERER := preload("res://scripts/runtime_proxy_renderer.gd")
const RUNTIME_LAUNCHER := preload("res://scripts/runtime_launcher.gd")
const RUNTIME_PLAN_VIEW := preload("res://scripts/runtime_plan_view.gd")
const LAYOUT_SESSION := preload("res://scripts/layout_session.gd")
const FURNITURE_ADJUSTMENT := preload("res://scripts/furniture_adjustment.gd")
const LAYOUT_CAMERA := preload("res://scripts/layout_camera.gd")
const DESKTOP_AUTHORING := preload("res://scripts/desktop_authoring.gd")
const VIEW_STYLE:=preload("res://scripts/runtime_view_style.gd")
const LIGHT_SETTINGS:=preload("res://scripts/light_settings.gd")
const DOOR_SETTINGS:=preload("res://scripts/door_settings.gd")
const ARCHITECTURE_EDITOR:=preload("res://scripts/architecture_editor.gd")
const OBJECT_EDITOR:=preload("res://scripts/object_editor.gd")

enum ViewMode { WALKTHROUGH, PLAN }

var _world: Node3D
var _launcher
var _authoring
var _light_settings
var _door_settings
var _architecture_editor
var _object_editor
var _daylight:=0
var _spawn: Vector3
var _spawn_yaw = null
var _adjustment
var _editing := false
var _plan_view
var _view_mode := ViewMode.WALKTHROUGH
var _menu_open := false
var _session
var _runtime_data: Dictionary
var _collider_nodes: Dictionary
var _furniture_root: Node3D
var _furniture_models: Dictionary
var _layout_camera
var _furniture_collider_ids: Array = []
var _discard: ConfirmationDialog
var _pending_action: Callable
var _scene_notes := PackedStringArray()
var _static_assets_missing := false
var _furniture_fallbacks := 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	get_tree().auto_accept_quit = false
	_session = LAYOUT_SESSION.new()
	add_child(_session)
	_discard = ConfirmationDialog.new()
	_discard.theme = UI.theme()
	_discard.dialog_text = "Discard unsaved Project changes?"
	_discard.ok_button_text = "Discard changes"
	_discard.confirmed.connect(func(): _pending_action.call())
	add_child(_discard)
	_launcher = RUNTIME_LAUNCHER.new()
	add_child(_launcher)
	_authoring=DESKTOP_AUTHORING.new()
	add_child(_authoring)
	_light_settings=LIGHT_SETTINGS.new();add_child(_light_settings)
	_door_settings=DOOR_SETTINGS.new();add_child(_door_settings)
	_architecture_editor=ARCHITECTURE_EDITOR.new();add_child(_architecture_editor)
	_architecture_editor.project_ready.connect(func(path:String):_request_action(_open_corrected_project.bind(path)))
	_object_editor=OBJECT_EDITOR.new();add_child(_object_editor)
	_object_editor.command_requested.connect(_edit_layout)
	_object_editor.preview_requested.connect(_preview_object_replacement)
	_object_editor.geometry_requested.connect(_show_opening_geometry)
	_object_editor.panels_requested.connect(_show_door_settings)
	_object_editor.light_requested.connect(_show_light_settings)
	_object_editor.closed.connect(func():
		if _object_editor.visible:return
		while _editing or _session.busy:await get_tree().process_frame
		if _world!=null and not _menu_open:_resume())
	_door_settings.command_requested.connect(_edit_layout)
	_door_settings.visibility_changed.connect(func():
		if _door_settings.visible:return
		while _editing or _session.busy:await get_tree().process_frame
		if _world!=null and not _menu_open:_resume())
	_light_settings.command_requested.connect(_edit_layout)
	_light_settings.closed.connect(func():
		while _editing or _session.busy:await get_tree().process_frame
		if _world!=null and not _menu_open:_resume())
	_authoring.project_ready.connect(func(path:String):_request_action(_open_project.bind(path)))
	_authoring.correction_ready.connect(_show_plan_editor)
	_launcher.correction_requested.connect(_show_plan_editor)
	_launcher.object_edit_requested.connect(_show_object_editor)
	_launcher.authoring_requested.connect(func(page:int):_authoring.show_page(page))
	_launcher.scene_selected.connect(func(path: String): _request_action(_open_scene.bind(path)))
	_launcher.project_selected.connect(func(path: String): _request_action(_open_project.bind(path)))
	_launcher.resume_requested.connect(_resume)
	_launcher.respawn_requested.connect(_return_to_start)
	var artifacts := RUNTIME_ARTIFACTS.new()
	var runtime_path := artifacts.runtime_path_from_args()
	if runtime_path.is_empty():
		_show_menu()
	else:
		_open_scene(runtime_path, artifacts.architecture_path_from_args(runtime_path))

func _open_scene(runtime_path: String, architecture_path: String = "", editor_state: Dictionary = {}) -> bool:
	var artifacts := RUNTIME_ARTIFACTS.new()
	if architecture_path.is_empty():
		architecture_path = artifacts.default_architecture_path(runtime_path)
	var data := artifacts.load_runtime(runtime_path)
	if data.is_empty():
		_show_menu("Could not open this compiled runtime scene.\nExport a runtime scene from Plan2World and select its runtime JSON.\n%s" % runtime_path)
		return false
	if not artifacts.architecture_matches(data, architecture_path):
		_show_menu("The architecture GLB belongs to a different export. Open the complete matching scene package.")
		return false
	var spawn = _choose_spawn(data)
	if spawn == null:
		_show_menu("Runtime scene has no compiled player spawn. Re-export after setting a valid spawn in the authoring project.")
		return false
	# Resources and node construction stay outside the active SceneTree. A
	# candidate cannot render, collide or consume input before this commit.
	var stage := _stage_world(data, artifacts, runtime_path, architecture_path)
	if stage.is_empty():
		_show_menu("Could not build the runtime scene; the previous world is retained.")
		return false
	var previous := _world
	if previous != null:
		remove_child(previous)
	_world = stage["world"]
	_world.name = "RuntimeScene"
	_world.process_mode = Node.PROCESS_MODE_PAUSABLE
	_spawn = spawn
	_spawn_yaw = _spawn_floor(data).get("walkthroughYawClockwiseRadians")
	_runtime_data = data
	_collider_nodes = stage["colliders"]
	_furniture_root = stage["furniture"]["root"]
	_furniture_models = stage["furniture"]["models"]
	_furniture_collider_ids = stage["furniture"]["colliders"].keys()
	add_child(_world)
	var presentation_loaded: bool = stage["presentation_loaded"]
	var presentation_stats: Dictionary = stage["presentation_stats"]
	var runtime_stats: Dictionary = stage["runtime_stats"]
	var asset_count: int = stage["asset_count"]
	var player := P2WPlayer.new()
	player.name = "Player"
	_world.add_child(player)
	player.configure(data.get("playerProfile", {}), spawn, _spawn_yaw)
	_layout_camera = LAYOUT_CAMERA.new()
	_world.add_child(_layout_camera)
	_layout_camera.configure(data, _collider_nodes, _furniture_models, player)
	_layout_camera.display=_world.get_node("ViewStyle")
	_layout_camera.display.refresh(data,_furniture_models)
	_layout_camera.pose_previewed.connect(_layout_camera.display.preview_light)
	_adjustment = FURNITURE_ADJUSTMENT.new()
	_world.add_child(_adjustment)
	_adjustment.configure(_layout_camera, player)
	_adjustment.state_changed.connect(_sync_controls)
	_adjustment.message.connect(_layout_message)
	_plan_view = RUNTIME_PLAN_VIEW.new()
	_world.add_child(_plan_view)
	_plan_view.configure(data, _layout_camera)
	_plan_view.register_dialog(_door_settings);_plan_view.register_dialog(_object_editor);_plan_view.register_dialog(_light_settings.dialog)
	_layout_camera.view_started.connect(_sync_controls)
	_layout_camera.view_settled.connect(_sync_controls)
	_plan_view.walkthrough_requested.connect(_show_walkthrough)
	_plan_view.menu_requested.connect(_show_menu)
	_plan_view.command_requested.connect(_edit_layout)
	_plan_view.preview_requested.connect(_begin_placement)
	_plan_view.light_requested.connect(_show_light_settings)
	_plan_view.walls_requested.connect(func():_show_plan_editor())
	_plan_view.opening_requested.connect(_show_object_editor)
	_plan_view.save_requested.connect(_save_layout)
	_plan_view.export_requested.connect(func(path: String):
		var error: Error = _session.export_runtime(path)
		_plan_view.show_message("Runtime scene exported." if error == OK else "Could not export the runtime scene: " + error_string(error)))
	_view_mode = ViewMode.WALKTHROUGH
	var presentation_status := architecture_path if presentation_loaded else "runtime proxy fallback"
	var notes: PackedStringArray = []
	if not presentation_loaded:
		notes.append("Architecture GLB missing/unreadable; showing compatibility proxies.")
	_furniture_fallbacks = stage["furniture"]["missing_count"]
	_static_assets_missing = presentation_loaded and int(presentation_stats.get("collider_proxy_count", 0)) > int(stage["furniture"]["proxy_count"])
	var unsupported := 0
	for entity in data["entities"]:
		if (entity["kind"] == "door" and entity["interaction"]["kind"] == "unsupported") or (entity["kind"] == "stair" and entity["traversal"]["kind"] == "unsupported"):
			unsupported += 1
	if unsupported > 0:
		notes.append("%d unsupported door/stair interaction(s); see scene export notes." % unsupported)
	_scene_notes = notes
	_show_status(str(data["source"]["projectName"]))
	_update_asset_notice()
	if editor_state.is_empty(): _session.clear()
	else: _session.accept(editor_state, true)
	if previous != null:
		previous.queue_free()
	_resume()
	_sync_editor()
	print("Plan2World runtime loaded: ", runtime_path, " architecture=", presentation_status,
		" runtime=", runtime_stats, " assets=", asset_count, " presentation=", presentation_stats)
	return true

func _request_action(action: Callable) -> void:
	if _session.busy:
		return
	if _session.is_dirty():
		_pending_action = action
		_show_menu()
		_discard.popup_centered()
	else:
		action.call()

func _open_project(path: String) -> bool:
	_show_menu("Opening Project…")
	_launcher.set_busy(true)
	var result: Dictionary = await _session.open_project(path)
	_launcher.set_busy(false)
	if not result.get("ok", false):
		_show_menu(str(result["error"]))
		return false
	if not _open_scene(str(result["runtimePath"]), "", result):
		_session.discard_candidate(result)
		return false
	_view_mode = ViewMode.PLAN
	_resume()
	_sync_editor()
	return true

func _show_plan_editor(path:="") -> void:
	if _editing or _session.busy:return
	if path.is_empty():
		if _session.current().is_empty():return
		path=_session.current()["projectPath"]
	_show_menu();_architecture_editor.show_project(path)

func _open_corrected_project(path:String) -> void:
	if await _open_project(path):
		_architecture_editor.session._dirty=false
		_architecture_editor._source_path=_session.current()["projectPath"]

func _edit_layout(command: Dictionary) -> void:
	if _session.busy or _editing:
		return
	_layout_message("")
	_editing = true
	_sync_controls()
	_plan_view.set_editor(_session.current(), true, _session.is_dirty())
	_launcher.set_busy(true)
	var result: Dictionary = await _session.apply_command(command)
	_launcher.set_busy(false)
	_editing = false
	if result.get("ok", false):
		var candidate: Dictionary = RUNTIME_ARTIFACTS.new().load_runtime(str(result["runtimePath"]))
		if result.get("updateKind")=="window-style":
			var artifacts:=RUNTIME_ARTIFACTS.new()
			var architecture_path:String=artifacts.default_architecture_path(str(result["runtimePath"]))
			var architecture=artifacts.load_architecture(architecture_path) if not candidate.is_empty() and artifacts.architecture_matches(candidate,architecture_path) else null
			if architecture==null or candidate["colliders"]!=_runtime_data["colliders"]:
				if architecture!=null:architecture.free()
				_session.discard_candidate(result);_sync_controls();_layout_message("Could not replace this window. Previous window retained.");return
			_layout_camera.display._restore()
			var old:Node=_world.get_node("Architecture");_world.remove_child(old);old.queue_free();_world.add_child(architecture)
			_runtime_data=candidate;_layout_camera.data=candidate
			for entity in candidate["entities"]:_layout_camera._entities[entity["id"]]=entity
			_layout_camera.display.refresh(candidate,_furniture_models);_layout_camera.update_floor_visibility()
			_session.accept(result);_sync_controls();return
		if result.get("updateKind")=="door-material":
			if candidate.is_empty() or not _apply_door_material(result,candidate,str(command["id"])):
				_session.discard_candidate(result);_sync_controls();_layout_message("Could not replace the door appearance. Previous door retained.");return
			_session.accept(result);_sync_controls();return
		if result.get("updateKind")=="doors":
			if candidate.is_empty() or not _apply_door_state(result,candidate,str(command["id"])):
				_session.discard_candidate(result);_sync_controls();_layout_message("Door panels overlap an obstacle or the player. Previous door retained.");return
			_session.accept(result);_sync_controls();return
		if not candidate.is_empty() and candidate["source"].get("architectureSha256")!=_runtime_data["source"].get("architectureSha256"):
			_session.discard_candidate(result);_sync_controls();_layout_message("The edit changed architectural artifacts. Previous world retained.");return
		var id := "" if result.get("selectedId") == null else str(result["selectedId"])
		if candidate.is_empty() or (not id.is_empty() and not _layout_camera.placement_allowed(candidate, id)):
			_layout_camera.cancel_drag()
			_session.discard_candidate(result)
			_sync_controls()
			_layout_message("Furniture overlaps an obstacle.")
			return
		_apply_layout_state(result, candidate)
		_session.accept(result)
		_plan_view.command_applied(command)
		_sync_controls()
	else:
		_layout_camera.cancel_drag()
		_sync_controls()
		_layout_message(str(result["error"]))

func _begin_placement(command:Dictionary) -> void:
	if _editing or _session.busy:return
	_layout_message("")
	_layout_camera.cancel_drag();_editing=true;_sync_controls()
	var result:Dictionary=await _session.preview(command)
	_editing=false;_sync_controls()
	if not result.get("ok",false):_layout_message(str(result["error"]));return
	_plan_view.set_catalog_open(false)
	_layout_camera.begin_placement(command,result["preview"])

func _apply_layout_state(state: Dictionary, data: Dictionary) -> void:
	var artifacts := RUNTIME_ARTIFACTS.new()
	_layout_camera.cancel_drag()
	var changed:=_changed_furniture(data)
	_layout_camera.display.prepare_update(changed)
	_render_furniture(data, artifacts.load_assets(str(state["runtimePath"])),changed)
	_runtime_data = data
	_spawn = _choose_spawn(data)
	_spawn_yaw = _spawn_floor(data).get("walkthroughYawClockwiseRadians")
	_layout_camera.display.refresh_subset(data,_furniture_models,changed)
	if not changed.is_empty():_layout_camera.refresh(data, _collider_nodes, _furniture_models,changed.keys())
	_layout_camera.selected_id = "" if state.get("selectedId") == null else str(state["selectedId"])
	_sync_editor()

func _apply_door_material(state:Dictionary,data:Dictionary,id:String) -> bool:
	if data["source"].get("architectureSha256")!=_runtime_data["source"].get("architectureSha256") or data["colliders"]!=_runtime_data["colliders"]:return false
	var entity:Dictionary={}
	for item in data["entities"]:
		if item["id"]==id:entity=item
	if entity.is_empty():return false
	_layout_camera.display.prepare_update({id:true})
	if not RUNTIME_ASSET_RENDERER.new().replace_door_appearance(entity,_collider_nodes,RUNTIME_ARTIFACTS.new().load_assets(str(state["runtimePath"]))):return false
	_runtime_data=data;_layout_camera.data=data
	for item in data["entities"]:_layout_camera._entities[item["id"]]=item
	_layout_camera.display.refresh(data,_furniture_models);_layout_camera.update_floor_visibility()
	return true

func _apply_door_state(state:Dictionary,data:Dictionary,id:String) -> bool:
	if data["source"].get("architectureSha256")!=_runtime_data["source"].get("architectureSha256"):return false
	var entity:Dictionary={}
	for item in data["entities"]:
		if item["id"]==id:entity=item
	if entity.is_empty():return false
	var exclusions:Array[RID]=[];var old_root:Node
	for collider in _runtime_data["colliders"]:
		if collider["ownerId"]==id and _collider_nodes.has(collider["id"]):
			var body:PhysicsBody3D=_collider_nodes[collider["id"]];exclusions.append(body.get_rid());old_root=body.get_parent()
		elif collider["ownerId"]==entity["hostWallId"] and entity["interaction"].get("allowHostOverlap",true) and _collider_nodes.has(collider["id"]):
			exclusions.append(_collider_nodes[collider["id"]].get_rid())
	var colliders:Dictionary={}
	for collider in data["colliders"]:
		if collider["ownerId"]!=id:continue
		colliders[collider["id"]]=collider
		var shape:=BoxShape3D.new();shape.size=Vector3(collider["size"][0],collider["size"][1],collider["size"][2])-Vector3.ONE*.00001
		var query:=PhysicsShapeQueryParameters3D.new();query.shape=shape;query.exclude=exclusions;query.collision_mask=1;query.margin=0
		query.transform=Transform3D(Basis(Vector3.UP,-float(collider["yawClockwiseRadians"])),Vector3(collider["center"][0],collider["center"][1],collider["center"][2]))
		if not get_world_3d().direct_space_state.intersect_shape(query,1).is_empty():return false
	var group:=Node3D.new();group.name="EditedDoor"
	var nodes:Dictionary={};var leaves:Dictionary={}
	RUNTIME_LOADER.new()._build_door(entity,colliders,_collider_nodes.duplicate(),leaves,group)
	for leaf in entity["interaction"]["leaves"]:nodes[leaf["colliderId"]]=leaves[leaf["id"]]
	var subset:Dictionary={"entities":[entity],"colliders":colliders.values(),"floors":data["floors"]}
	var built:Dictionary={"leaf_nodes":leaves,"collider_nodes":nodes}
	var assets:=RUNTIME_ARTIFACTS.new().load_assets(str(state["runtimePath"]))
	var presented:Dictionary=RUNTIME_ASSET_RENDERER.new().render(subset,group,built,assets)
	RUNTIME_PROXY_RENDERER.new().render(subset,group,built,true,presented["presented"])
	# Commit only the changed assembly. Architecture, other doors, player and
	# camera retain their existing nodes and state.
	if old_root!=null:
		if old_root.get_parent().name=="EditedDoor":old_root=old_root.get_parent()
		old_root.get_parent().remove_child(old_root);old_root.queue_free()
	for collider in _runtime_data["colliders"]:
		if collider["ownerId"]==id:_collider_nodes.erase(collider["id"])
	_world.add_child(group)
	_collider_nodes.merge(nodes)
	_runtime_data=data;_layout_camera._build_door_clearance(data)
	_layout_camera.refresh(data,_collider_nodes,_furniture_models)
	_layout_camera.display.refresh(data,_furniture_models)
	return true

func _stage_world(data: Dictionary, artifacts, runtime_path: String, architecture_path: String) -> Dictionary:
	var world := Node3D.new()
	var style:=VIEW_STYLE.new();world.add_child(style);style.configure(data,_daylight)
	var architecture = artifacts.load_architecture(architecture_path)
	if architecture != null:
		world.add_child(architecture)
	var ids := {}
	for entity in data["entities"]:
		if entity["kind"] == "furniture": ids[entity["id"]] = true
	var static_data := data.duplicate()
	static_data["entities"] = data["entities"].filter(func(entity): return entity["kind"] != "furniture")
	static_data["colliders"] = data["colliders"].filter(func(collider): return not ids.has(collider["ownerId"]))
	var built: Dictionary = RUNTIME_LOADER.new().build(static_data, world)
	var assets: Dictionary = artifacts.load_assets(runtime_path)
	var presented: Dictionary = RUNTIME_ASSET_RENDERER.new().render(static_data, world, built, assets)
	var stats: Dictionary = RUNTIME_PROXY_RENDERER.new().render(static_data, world, built, architecture != null, presented["presented"])
	var furniture := _build_furniture(data, assets, world)
	var colliders: Dictionary = built["collider_nodes"]
	colliders.merge(furniture["colliders"])
	if colliders.size() != data["colliders"].size():
		world.free()
		return {}
	stats["collider_proxy_count"] += furniture["proxy_count"]
	built["stats"]["entity_count"] += ids.size()
	built["stats"]["static_collider_count"] += furniture["colliders"].size()
	return { "world": world, "colliders": colliders, "furniture": furniture, "presentation_loaded": architecture != null, "presentation_stats": stats, "runtime_stats": built["stats"], "asset_count": presented["presented"].size() + furniture["asset_count"] }

func _build_furniture(data: Dictionary, assets: Dictionary, world: Node3D) -> Dictionary:
	var group := Node3D.new()
	group.name = "FurnitureLayout"
	world.add_child(group)
	var entities: Array = data["entities"].filter(func(entity): return entity["kind"] == "furniture")
	var ids := {}
	for entity in entities:
		ids[entity["id"]] = true
	var furniture := { "entities": entities, "colliders": data["colliders"].filter(func(collider): return ids.has(collider["ownerId"])), "floors": [] }
	var built: Dictionary = RUNTIME_LOADER.new().build(furniture, group)
	var presented: Dictionary = RUNTIME_ASSET_RENDERER.new().render(furniture, group, built, assets)
	var proxy: Dictionary = RUNTIME_PROXY_RENDERER.new().render(furniture, group, built, true, presented["presented"])
	var models: Dictionary = presented["instances"].duplicate()
	models.merge(proxy["instances"])
	return { "root": group, "colliders": built["collider_nodes"], "models": models, "asset_count": presented["presented"].size(), "proxy_count": proxy["collider_proxy_count"],
		"missing_count":models.values().filter(func(model):return not model.has_meta("p2w_asset_ref")).size() }

func _changed_furniture(data:Dictionary) -> Dictionary:
	var old:Dictionary={};var changed:Dictionary={}
	for entity in _runtime_data["entities"]:
		if entity["kind"]=="furniture":old[entity["id"]]=entity
	for entity in data["entities"]:
		if entity["kind"]!="furniture":continue
		if old.get(entity["id"])!=entity:changed[entity["id"]]=true
		old.erase(entity["id"])
	for id in old:changed[id]=true
	return changed

func _render_furniture(data: Dictionary, assets: Dictionary,changed:Dictionary) -> void:
	if changed.is_empty():return
	var subset:=data.duplicate();subset["entities"]=data["entities"].filter(func(entity):return changed.has(entity["id"]))
	var stage:=Node3D.new();var next:=_build_furniture(subset,assets,stage)
	for id in changed:
		var model:Node=_furniture_models.get(id)
		if is_instance_valid(model) and model.get_parent()==_furniture_root:
			_furniture_root.remove_child(model);model.queue_free()
		_furniture_models.erase(id)
	for collider in _runtime_data["colliders"]:
		if not changed.has(collider["ownerId"]) or not _collider_nodes.has(collider["id"]):continue
		var node:Node=_collider_nodes[collider["id"]]
		_furniture_root.remove_child(node);node.queue_free();_collider_nodes.erase(collider["id"]);_furniture_collider_ids.erase(collider["id"])
	for child in next["root"].get_children():
		next["root"].remove_child(child);_furniture_root.add_child(child)
	stage.free()
	_furniture_models.merge(next["models"])
	_furniture_collider_ids.append_array(next["colliders"].keys())
	_collider_nodes.merge(next["colliders"])
	_furniture_fallbacks=0
	for model in _furniture_models.values():
		if not model.has_meta("p2w_asset_ref"):_furniture_fallbacks+=1
	_update_asset_notice()

func _sync_editor() -> void:
	_plan_view.set_editor(_session.current(), _session.busy or _editing or _layout_camera.transitioning, _session.is_dirty())

func _sync_controls() -> void:
	var modal_open:bool=_light_settings.dialog.visible or _door_settings.visible or _object_editor.visible or _architecture_editor.visible
	var walking: bool = not _menu_open and not modal_open and _view_mode == ViewMode.WALKTHROUGH and not _layout_camera.transitioning and not _adjustment.active and not _editing
	var player := _world.get_node("Player") as P2WPlayer
	player.set_physics_process(walking)
	player.set_process_unhandled_input(not _menu_open and not modal_open and _view_mode == ViewMode.WALKTHROUGH and not _layout_camera.transitioning)
	player.interaction_enabled = walking
	_adjustment.set_process_unhandled_input(not _menu_open and not _editing and not modal_open)
	_layout_camera.set_process_unhandled_input(not _menu_open and not modal_open)
	if not _menu_open:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if _view_mode==ViewMode.WALKTHROUGH and not _layout_camera.transitioning and not modal_open else Input.MOUSE_MODE_VISIBLE
	_sync_editor()

func _save_layout(path: String) -> void:
	var error: Error = _session.save_project(path)
	_sync_editor()
	_plan_view.show_message("Project saved." if error == OK else "Could not save Project: " + error_string(error))

func _unhandled_key_input(event: InputEvent) -> void:
	if _authoring._screen.visible:return
	if _light_settings.dialog.visible or _door_settings.visible or _object_editor.visible or _architecture_editor.visible:return
	if event is InputEventKey and event.pressed and not event.echo and not _menu_open and _world!=null:
		if event.keycode==KEY_T and _view_mode==ViewMode.WALKTHROUGH:
			_set_daylight((_daylight+1)%4);get_viewport().set_input_as_handled();return
		if event.keycode==KEY_L and not _session.current().is_empty():
			_show_light_settings(_layout_camera.selected_id if _view_mode==ViewMode.PLAN or _adjustment.active else _adjustment.aimed_id())
			get_viewport().set_input_as_handled();return
		if event.keycode==KEY_M and not _session.current().is_empty():
			if _view_mode==ViewMode.PLAN:
				if not _plan_view._catalog_view.visible:_plan_view._action("ReplaceFurniture")
			else:_show_object_editor()
			get_viewport().set_input_as_handled();return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F1:
		if _menu_open and _world != null:
			_resume()
		else:
			_show_menu()
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F2 and not _menu_open and _world != null and not _session.busy:
		if _view_mode == ViewMode.PLAN:
			_show_walkthrough()
		else:
			_view_mode = ViewMode.PLAN
			_release_actions()
			_resume()
		get_viewport().set_input_as_handled()

func _show_walkthrough() -> void:
	if _session.busy:
		return
	_view_mode = ViewMode.WALKTHROUGH
	_release_actions()
	_resume()

func _release_actions() -> void:
	for action in InputMap.get_actions():
		Input.action_release(action)

func _show_menu(message: String = "") -> void:
	get_tree().paused = true
	_menu_open = true
	# A key-up can be lost when the desktop switches windows. Clear action state
	# here so explicit resume cannot replay movement from before the pause.
	_release_actions()
	if _world != null:
		_adjustment.cancel()
		_plan_view.cancel_drag()
		_plan_view.hide()
		_sync_controls()
	_launcher.show_menu(_world != null, message)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and is_node_ready():
		_request_action(func(): get_tree().quit())
		return
	if what == NOTIFICATION_WM_WINDOW_FOCUS_OUT and is_node_ready() and _world != null and not _menu_open:
		if _plan_view.has_open_dialog() or _light_settings.dialog.visible or _door_settings.visible or _object_editor.visible or _architecture_editor.visible:
			return
		_show_menu("Session paused while this window was inactive.")

func _return_to_start() -> void:
	_world.get_node("Player").respawn(_spawn, _spawn_yaw)
	_show_walkthrough()

func _resume() -> void:
	if _session.busy:
		return
	_launcher.hide_menu()
	_menu_open = false
	_adjustment.cancel()
	var plan := _view_mode == ViewMode.PLAN
	_plan_view.visible = plan
	_world.get_node("HUD").visible = not plan
	get_tree().paused = false
	_layout_camera.set_plan_mode(plan)
	_sync_controls()

func _spawn_floor(data: Dictionary) -> Dictionary:
	for floor in data["floors"]:
		if floor.has("entranceDoorId"): return floor
	for floor in data["floors"]:
		if floor["walkthroughStart"] != null: return floor
	return {}

func _choose_spawn(data: Dictionary):
	var floor := _spawn_floor(data)
	if floor.is_empty(): return null
	var point: Array = floor["walkthroughStart"]
	return Vector3(point[0],point[1],point[2])

func _layout_message(text: String) -> void:
	if _plan_view != null: _plan_view.show_message(text)
	if _world != null:
		var label := _world.get_node_or_null("HUD/LayoutStatus") as Label
		if label != null:
			label.text = text
			label.visible = not text.is_empty()

func _unhandled_input(event: InputEvent) -> void:
	if _door_settings.visible or _object_editor.visible or _architecture_editor.visible or _light_settings.dialog.visible:return
	if event is InputEventJoypadButton and event.is_action_pressed("view_toggle") and not _menu_open and _world != null and not _editing:
		if _view_mode == ViewMode.PLAN: _show_walkthrough()
		else:
			_view_mode = ViewMode.PLAN
			_release_actions()
			_resume()
		get_viewport().set_input_as_handled()

func _set_daylight(mode:int) -> void:
	_daylight=mode%4;_world.get_node("ViewStyle").set_daylight(_daylight)
	_world.get_node("HUD/ViewControls/Daylight").select(_daylight)

func _show_light_settings(id:String) -> void:
	if _editing or _session.busy or _session.current().is_empty() or not _layout_camera._entities.has(id) or not _layout_camera._entities[id].has("light"):return
	if _layout_camera._entities[id].get("locked",false):return
	_adjustment.cancel();_layout_camera.cancel_drag();_release_actions()
	_light_settings.show_light(_layout_camera._entities[id]);get_tree().paused=true;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE;_sync_controls()

func _show_door_settings(id:="") -> void:
	if _editing or _session.busy:return
	_adjustment.cancel();_layout_camera.cancel_drag();_release_actions()
	_door_settings.show_doors(_session.current().get("doors",[]),_layout_camera._entities.get(id,{}).get("floorId",_layout_camera.floor_id),id)
	if _door_settings.visible:get_tree().paused=true;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE;_sync_controls()

func _show_object_editor(id:="") -> void:
	if _editing or _session.busy or _session.current().is_empty():return
	if id.is_empty():id=_layout_camera.selected_id if _view_mode==ViewMode.PLAN else _adjustment.aimed_id()
	var entity:Dictionary=_layout_camera._entities.get(id,{})
	if entity.get("kind") not in ["furniture","door","window"] or entity.get("locked",false) or entity.get("doorType")=="opening":
		_layout_message("Select an unlocked object, door or window to modify.");return
	_adjustment.cancel();_layout_camera.cancel_drag();_release_actions()
	_object_editor.show_object(_session.current(),entity)
	if _object_editor.visible:get_tree().paused=true;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE;_sync_controls()

func _preview_object_replacement(command:Dictionary) -> void:
	_view_mode=ViewMode.PLAN;_resume()
	while _layout_camera.transitioning:await get_tree().process_frame
	_layout_camera.selected_id=command["id"]
	_plan_view.set_catalog_open(true,true)
	for i in range(_plan_view._catalog.size()):
		if _plan_view._catalog[i]["asset"]==command["asset"]:
			_plan_view._catalog_view.reveal(i);_plan_view._request_piece();return

func _show_opening_geometry(id:String) -> void:
	var entity:Dictionary=_layout_camera._entities.get(id,{})
	if entity.is_empty():return
	var path:String=_session.current()["projectPath"]
	_show_plan_editor(path)
	while _architecture_editor.session.busy:await get_tree().process_frame
	if _architecture_editor._source_path!=path:return
	for i in range(_architecture_editor.session.current()["editor"]["floors"].size()):
		if _architecture_editor.session.current()["editor"]["floors"][i]["id"]==entity["floorId"]:
			_architecture_editor._floors.select(i);_architecture_editor._choose_floor(i);_architecture_editor._tabs.current_tab=1;_architecture_editor._select("opening",id);return

func _process(_delta:float) -> void:
	if _world==null:return
	var prompt:Button=_world.get_node_or_null("HUD/ModifyObject")
	if prompt==null:return
	prompt.visible=false
	if _view_mode!=ViewMode.WALKTHROUGH or _menu_open or _editing or _adjustment.active or _object_editor.visible or _door_settings.visible or _light_settings.dialog.visible or _architecture_editor.visible:return
	var entity:Dictionary=_layout_camera._entities.get(_adjustment.aimed_id(),{})
	prompt.visible=not _session.current().is_empty() and entity.get("kind") in ["furniture","door","window"] and not entity.get("locked",false) and entity.get("doorType")!="opening"


func _update_asset_notice() -> void:
	var notes := _scene_notes.duplicate()
	if _static_assets_missing or _furniture_fallbacks > 0:
		notes.append("%d item(s) use placeholders. Select a piece to choose a replacement."%_furniture_fallbacks if not _static_assets_missing else "Some scene models are unavailable; placeholders remain visible.")
	var label := _world.get_node("HUD/Identity/Content/PresentationNotes") as Label
	label.text = "\n".join(notes)
	label.visible = not notes.is_empty()

func _show_status(project_name: String) -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	_world.add_child(layer)
	var panel := PanelContainer.new()
	panel.name = "Identity"
	panel.theme = UI.theme()
	panel.position = Vector2(20, 20)
	panel.custom_minimum_size = Vector2(300, 0)
	layer.add_child(panel)
	var identity := VBoxContainer.new()
	identity.name = "Content"
	identity.add_theme_constant_override("separation", 3)
	panel.add_child(identity)
	identity.add_child(UI.label("AT HOME  /  EXPLORING", 12, UI.LEAF))
	var title := UI.label(project_name, 21)
	title.custom_minimum_size.x = 280
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	identity.add_child(title)
	var note := UI.label("", 13, UI.AMBER)
	note.name = "PresentationNotes"
	note.custom_minimum_size.x = 280
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	identity.add_child(note)
	UI.ignore_pointer(panel)
	var crosshair := UI.label("·", 30, Color("fffdf5"))
	crosshair.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	crosshair.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-12, -18)
	crosshair.size = Vector2(24, 36)
	crosshair.add_theme_color_override("font_shadow_color", UI.INK)
	crosshair.add_theme_constant_override("shadow_outline_size", 3)
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(crosshair)
	var modify:=UI.button("Modify  M","ModifyObject",func():_show_object_editor())
	modify.theme=UI.theme();modify.set_anchors_preset(Control.PRESET_CENTER);modify.position=Vector2(24,28);modify.hide();layer.add_child(modify)
	var help := UI.label("WASD  Wander   E  Door   F  Adjust   L  Light   T  Daylight   F2  Arrange   F1  Pause", 14)
	help.add_theme_stylebox_override("normal", UI.box(UI.PAPER, 16, 14, true))
	help.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	help.offset_left = 20; help.offset_top = -64; help.offset_bottom = -20
	help.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(help)
	var status := UI.label("", 15)
	status.name = "LayoutStatus"
	status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	status.offset_top = -156; status.offset_bottom = -80
	status.offset_left = 20; status.offset_right = -20
	status.add_theme_stylebox_override("normal", UI.box(UI.PAPER, 16, 14, true))
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status.hide()
	layer.add_child(status)
	var top_view := UI.button("Arrange  F2", "TopView", func():
		_view_mode = ViewMode.PLAN
		_release_actions()
		_resume(), true)
	top_view.theme = UI.theme()
	top_view.custom_minimum_size=Vector2(172,48)
	var view_controls:=HBoxContainer.new();view_controls.name="ViewControls";view_controls.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	view_controls.offset_left=-354;view_controls.offset_right=-20;view_controls.offset_top=20;view_controls.offset_bottom=68;view_controls.theme=UI.theme();layer.add_child(view_controls)
	var daylight:=OptionButton.new();daylight.name="Daylight";daylight.custom_minimum_size=Vector2(150,48)
	for text in VIEW_STYLE.PRESETS:daylight.add_item(text)
	daylight.select(_daylight);daylight.item_selected.connect(_set_daylight);daylight.tooltip_text="Natural light · T cycles modes · Esc frees pointer"
	view_controls.add_child(daylight);view_controls.add_child(top_view)
