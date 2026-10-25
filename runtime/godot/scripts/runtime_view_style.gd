extends Node

# Native presentation profiles over the same world. No floor-plan geometry,
# collision or attachment is inferred from meshes here.
const PRESETS := ["Day", "Night", "Sunrise", "Sunset"]
var daylight := 0
var plan := false
var _data: Dictionary
var _models: Dictionary
var _environment: Environment
var _sun: DirectionalLight3D
var _lights: Node3D
var _sources := {}
var _source_contracts := {}
var _originals: Array=[]
var _entities := {}

func configure(data: Dictionary, mode: int) -> void:
	name="ViewStyle";daylight=mode
	var world:=WorldEnvironment.new();world.name="WorldEnvironment";_environment=Environment.new();world.environment=_environment;get_parent().add_child(world)
	_environment.background_mode=Environment.BG_COLOR
	_environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
	_sun=DirectionalLight3D.new();_sun.name="Sun";_sun.shadow_enabled=true;_sun.directional_shadow_max_distance=40;get_parent().add_child(_sun)
	_lights=Node3D.new();_lights.name="FurnitureLights";get_parent().add_child(_lights)
	refresh(data,{})

func refresh(data: Dictionary, models: Dictionary) -> void:
	_restore()
	_data=data;_models=models;_entities.clear();_sources.clear();_source_contracts.clear()
	for child in _lights.get_children():_lights.remove_child(child);child.queue_free()
	for entity in data["entities"]:
		_entities[entity["id"]]=entity
		if not entity.has("light"):continue
		var contract:Dictionary=entity["light"]
		var lamp:Light3D=SpotLight3D.new() if contract["kind"]=="spot" else OmniLight3D.new()
		lamp.name="Light_"+str(entity["id"]).validate_node_name();lamp.shadow_enabled=true
		lamp.light_color=_color(contract["color"])
		# Photometric source stays engine-neutral; this renderer's reference exposure
		# maps 800 lm to energy 1. No model/material measurement defines a light.
		lamp.light_energy=float(contract["lumens"])/800.0
		if lamp is SpotLight3D:
			lamp.spot_range=contract["range"];lamp.spot_angle=contract["spotAngleDegrees"]
		else:lamp.omni_range=contract["range"]
		_lights.add_child(lamp);_sources[entity["id"]]=lamp;_source_contracts[entity["id"]]=contract
		preview_light(entity["id"],_v3(entity["position"]),entity["yawClockwiseRadians"])
		if models.has(entity["id"]):_emitter_materials(models[entity["id"]],contract)
	apply(plan)

func set_daylight(mode: int) -> void:
	daylight=mode%PRESETS.size()
	if not plan:apply(false)

func apply(enabled: bool) -> void:
	_restore();plan=enabled
	_environment.ssao_enabled=not plan
	_environment.ssao_radius=1.2;_environment.ssao_intensity=1.0
	_environment.glow_enabled=false
	_environment.tonemap_mode=Environment.TONE_MAPPER_LINEAR if plan else Environment.TONE_MAPPER_FILMIC
	var ambient: Array=[.62,.035,.20,.17]
	var sun_energy: Array=[1.15,.025,.72,.62]
	var sun_color: Array=[Color("fff3dc"),Color("7495cd"),Color("ffb16e"),Color("ff8b58")]
	var background: Array=[Color("dce6ee"),Color("101a30"),Color("edc6ab"),Color("c99d9e")]
	var rotation: Array=[Vector3(-55,-35,0),Vector3(-40,130,0),Vector3(-12,-85,0),Vector3(-10,85,0)]
	_environment.background_color=Color("f2f4ed") if plan else background[daylight]
	_environment.ambient_light_color=Color.WHITE if plan else sun_color[daylight]
	_environment.ambient_light_energy=0 if plan else ambient[daylight]
	_sun.visible=not plan;_sun.rotation_degrees=rotation[daylight];_sun.light_color=sun_color[daylight];_sun.light_energy=sun_energy[daylight]
	for id in _sources:_sources[id].visible=not plan and _source_contracts[id]["enabled"] and _source_contracts[id]["lumens"]>0
	_style(get_parent(),"")

func _restore() -> void:
	for saved in _originals:
		var mesh=saved[0]
		if not is_instance_valid(mesh):continue
		mesh.material_override=saved[1];mesh.cast_shadow=saved[3];mesh.visible=saved[4]
		for i in range(saved[2].size()):mesh.set_surface_override_material(i,saved[2][i])
	_originals.clear()

func _style(node:Node, inherited:String) -> void:
	if node.get_meta("p2w_editor_overlay",false):return
	if node is Light3D and node!=_sun and node.get_parent()!=_lights:node.visible=false
	var kind:=inherited
	var info:Dictionary=node.get_meta("extras",{}).get("plan2world",{})
	if not info.is_empty():kind=str(info.get("kind",kind))
	if info.get("view")=="plan" and node is Node3D:node.visible=plan
	var owner:=str(node.get_meta("p2w_owner_id",""))
	if _entities.has(owner):kind=_entities[owner]["kind"]
	if plan and node is MeshInstance3D and node.mesh!=null:
		var old:Array=[]
		for i in range(node.mesh.get_surface_count()):old.append(node.get_surface_override_material(i))
		_originals.append([node,node.material_override,old,node.cast_shadow,node.visible])
		node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if kind=="door":node.hide()
		var palette:Dictionary={"wall":"293c42","floor":"f5f0e3","column":"647878","stair":"cec5ae","plan-door":"ed792e","plan-window":"138cc5"}
		if palette.has(kind):node.material_override=_flat(null,Color(palette[kind]))
		elif node.material_override!=null:node.material_override=_flat(node.material_override)
		else:
			for i in range(node.mesh.get_surface_count()):
				var source=node.get_surface_override_material(i)
				if source==null:source=node.mesh.surface_get_material(i)
				node.set_surface_override_material(i,_flat(source))
	for child in node.get_children():_style(child,kind)

func _flat(source:Material,color:=Color.TRANSPARENT) -> StandardMaterial3D:
	var material:StandardMaterial3D=source.duplicate() if source is StandardMaterial3D else StandardMaterial3D.new()
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;material.emission_enabled=false
	if color!=Color.TRANSPARENT:material.albedo_color=color;material.albedo_texture=null;material.transparency=BaseMaterial3D.TRANSPARENCY_DISABLED
	return material

func _emitter_materials(node:Node,light:Dictionary) -> void:
	if node is MeshInstance3D and node.mesh!=null:
		for i in range(node.mesh.get_surface_count()):
			var source=node.mesh.surface_get_material(i)
			if source is StandardMaterial3D and source.resource_name=="p2w-lamp-emitter":
				var material:StandardMaterial3D=source.duplicate()
				material.emission_enabled=light["enabled"] and light["lumens"]>0;material.emission=_color(light["color"]);material.emission_energy_multiplier=.8
				node.set_surface_override_material(i,material)
	for child in node.get_children():_emitter_materials(child,light)

func preview_light(id:String,position:Vector3,yaw:float) -> void:
	if _sources.has(id):
		var basis:=Basis(Vector3.UP,-yaw)
		_sources[id].position=position+basis*_v3(_source_contracts[id]["localPosition"])
		if _sources[id] is SpotLight3D:_sources[id].basis=basis*Basis.looking_at(_v3(_source_contracts[id]["direction"]),Vector3.FORWARD)

func _v3(v:Array) -> Vector3:return Vector3(v[0],v[1],v[2])
func _color(v:Array) -> Color:return Color(v[0],v[1],v[2])
