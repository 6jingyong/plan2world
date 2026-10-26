extends Node

# Native presentation profiles over the same world. No floor-plan geometry,
# collision or attachment is inferred from meshes here.
const PRESETS := ["Day", "Night", "Sunrise", "Sunset"]
const LIGHTING:=preload("res://scripts/lighting_profile.gd")
var daylight := 0
var plan := false
var _environment: Environment
var _reflection_sky:ProceduralSkyMaterial
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
	# Metallic catalog/decor materials need an environment reflection reference.
	# Keep the background colour separate; this does not infer local mirror views.
	var sky:=Sky.new();_reflection_sky=ProceduralSkyMaterial.new();sky.sky_material=_reflection_sky
	_environment.sky=sky;_environment.reflected_light_source=Environment.REFLECTION_SOURCE_SKY
	_sun=DirectionalLight3D.new();_sun.name="Sun";_sun.shadow_enabled=true;_sun.directional_shadow_max_distance=40;get_parent().add_child(_sun)
	_lights=Node3D.new();_lights.name="FurnitureLights";get_parent().add_child(_lights)
	refresh(data,{})

func refresh(data: Dictionary, models: Dictionary) -> void:
	_restore()
	_entities.clear();_sources.clear();_source_contracts.clear()
	for child in _lights.get_children():_lights.remove_child(child);child.queue_free()
	for entity in data["entities"]:
		_entities[entity["id"]]=entity
		if not entity.has("light"):continue
		_add_fixture(entity,models)
	apply(plan)

func _add_fixture(entity:Dictionary,models:Dictionary) -> void:
	var id:String=entity["id"];var contract:Dictionary=entity["light"]
	var lamp:Light3D=SpotLight3D.new() if contract["kind"]=="spot" else OmniLight3D.new()
	lamp.name="Light_"+id.validate_node_name();lamp.shadow_enabled=true;lamp.light_color=_color(contract["color"])
	# One renderer calibration for full and incremental loading; native photometry
	# remains unchanged. The reference exposure maps 800 lm to energy 1.
	lamp.light_energy=float(contract["lumens"])/LIGHTING.LUMENS_PER_ENERGY
	if lamp is SpotLight3D:lamp.spot_range=contract["range"];lamp.spot_angle=contract["spotAngleDegrees"]
	else:lamp.omni_range=contract["range"]
	_lights.add_child(lamp);_sources[id]=lamp;_source_contracts[id]=contract
	preview_light(id,_v3(entity["position"]),entity["yawClockwiseRadians"])
	lamp.visible=not plan and contract["enabled"] and contract["lumens"]>0
	if models.has(id):_emitter_materials(models[id],contract)

func set_daylight(mode: int) -> void:
	daylight=mode%PRESETS.size()
	if not plan:apply(false)

func prepare_update(changed:Dictionary) -> void:
	var keep:Array=[]
	for saved in _originals:
		if changed.has(saved[5]):_restore_one(saved)
		else:keep.append(saved)
	_originals=keep

func refresh_subset(data:Dictionary,models:Dictionary,changed:Dictionary) -> void:
	_entities.clear()
	for entity in data["entities"]:_entities[entity["id"]]=entity
	for id in changed:
		if _sources.has(id):
			var source:Node=_sources[id];_lights.remove_child(source);source.queue_free();_sources.erase(id);_source_contracts.erase(id)
		if not _entities.has(id):continue
		var entity:Dictionary=_entities[id]
		if entity.has("light"):
			_add_fixture(entity,models)
		if models.has(id):_style(models[id],"furniture",str(id))

func apply(enabled: bool) -> void:
	_restore();plan=enabled
	_environment.ssao_enabled=not plan
	_environment.ssao_radius=1.2;_environment.ssao_intensity=1.0
	_environment.glow_enabled=false
	_environment.tonemap_mode=Environment.TONE_MAPPER_LINEAR if plan else Environment.TONE_MAPPER_FILMIC
	_environment.tonemap_exposure=1 if plan else LIGHTING.EXPOSURE
	_environment.tonemap_white=1 if plan else LIGHTING.WHITE_POINT
	_environment.background_color=Color("f2f4ed") if plan else LIGHTING.BACKGROUND[daylight]
	_reflection_sky.sky_top_color=LIGHTING.BACKGROUND[daylight]
	_reflection_sky.sky_horizon_color=LIGHTING.BACKGROUND[daylight].lerp(LIGHTING.SUN_COLOR[daylight],.3)
	_reflection_sky.ground_horizon_color=_reflection_sky.sky_horizon_color
	_reflection_sky.ground_bottom_color=LIGHTING.BACKGROUND[daylight].darkened(.75)
	_environment.ambient_light_color=Color.WHITE if plan else LIGHTING.SUN_COLOR[daylight]
	_environment.ambient_light_energy=0 if plan else LIGHTING.AMBIENT[daylight]
	_sun.visible=not plan;_sun.rotation_degrees=LIGHTING.ROTATION[daylight];_sun.light_color=LIGHTING.SUN_COLOR[daylight];_sun.light_energy=LIGHTING.SUN_ENERGY[daylight]
	for id in _sources:_sources[id].visible=not plan and _source_contracts[id]["enabled"] and _source_contracts[id]["lumens"]>0
	_style(get_parent(),"")

func _restore() -> void:
	for saved in _originals:
		_restore_one(saved)
	_originals.clear()

func _restore_one(saved:Array) -> void:
	var mesh=saved[0]
	if not is_instance_valid(mesh):return
	mesh.material_override=saved[1];mesh.cast_shadow=saved[3];mesh.visible=saved[4]
	for i in range(saved[2].size()):mesh.set_surface_override_material(i,saved[2][i])

func _style(node:Node, inherited:String,inherited_owner:="") -> void:
	if node.get_meta("p2w_editor_overlay",false):return
	if node is Light3D and node!=_sun and node.get_parent()!=_lights:node.visible=false
	var kind:=inherited
	var info:Dictionary=node.get_meta("extras",{}).get("plan2world",{})
	if not info.is_empty():kind=str(info.get("kind",kind))
	if info.get("view")=="plan" and node is Node3D:node.visible=plan
	var owner:=str(node.get_meta("p2w_owner_id",inherited_owner))
	if _entities.has(owner):kind=_entities[owner]["kind"]
	if plan and node is MeshInstance3D and node.mesh!=null:
		var old:Array=[]
		for i in range(node.mesh.get_surface_count()):old.append(node.get_surface_override_material(i))
		_originals.append([node,node.material_override,old,node.cast_shadow,node.visible,owner])
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
	for child in node.get_children():_style(child,kind,owner)

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
