extends RefCounted

# Editor assistance over compiled semantic dimensions, never presentation meshes.
# Units are metres. Mounted objects keep their explicit host; floor wall snaps
# only change the accepted native pose, never manufacture a wallMount.
const CAPTURE := 0.06
const RELEASE := 0.12
const GRID := 0.1
var enabled := true
var grid_enabled := true
var _held := ""
var _axis_held := {}

func clear() -> void:
	_held = ""
	_axis_held.clear()

func solve(scene: Dictionary, entity: Dictionary, point: Vector3, yaw: float, bypass := false) -> Dictionary:
	var result := { "point": point, "yaw": yaw, "label": "", "guides": [] }
	if not enabled or bypass:
		clear()
		return result
	if entity["movement"]["kind"] == "wall":
		var motion: Dictionary = entity["movement"]
		var origin := _v3(motion["origin"])
		var tangent := _v3(motion["tangent"])
		var along := (point - origin).dot(tangent)
		if grid_enabled:
			var snapped := clampf(snappedf(along, GRID), motion["along"][0], motion["along"][1])
			result.point += tangent * (snapped - along)
			result.label = "Wall grid · 10 cm"
		return result
	var best := INF
	var walls: Array = scene["entities"].filter(func(e): return e["kind"] == "wall" and e["floorId"] == entity["floorId"] and e["boundaryType"] == "solid" and e["visible"] and not e["path"].has("control"))
	walls.sort_custom(func(a, b): return a["id"] < b["id"])
	var next_held := ""
	for wall in walls:
		var start := _v2(wall["path"]["start"])
		var edge := _v2(wall["path"]["end"]) - start
		var length := edge.length()
		var half_width := float(entity["size"][0]) / 2
		if length < half_width * 2 or length < 0.001: continue
		var tangent := edge / length
		var normal := Vector2(-tangent.y, tangent.x)
		var local := Vector2(point.x, point.z) - start
		var side := 1.0 if local.dot(normal) >= 0 else -1.0
		var distance := float(wall["thickness"]) / 2 + float(entity["size"][2]) / 2
		var error := absf(local.dot(normal) - side * distance)
		var key := str(wall["id"]) + ":" + str(side)
		var tolerance := RELEASE if key == _held else CAPTURE
		var along := local.dot(tangent)
		var score := error - (RELEASE if key == _held else 0.0)
		if error > tolerance or score >= best or along < half_width - tolerance or along > length - half_width + tolerance: continue
		along = clampf(along, half_width, length - half_width)
		if _aperture(scene, wall, entity, along, half_width): continue
		if grid_enabled: along = clampf(snappedf(along, GRID), half_width, length - half_width)
		if _aperture(scene, wall, entity, along, half_width): continue
		var target := start + tangent * along + normal * side * distance
		result.point = Vector3(target.x, point.y, target.y)
		result.yaw = atan2(tangent.y, tangent.x) + (0 if side > 0 else PI)
		if float(entity.get("mirror", [1, 1, 1])[2]) < 0: result.yaw += PI
		result.label = "Wall aligned"
		result.guides = [[Vector3(start.x, point.y, start.y), Vector3(start.x + edge.x, point.y, start.y + edge.y)]]
		best = score
		next_held = key
	if not next_held.is_empty():
		_held = next_held
		_axis_held.clear()
		return result
	# World-axis footprint edges/centres; nearby objects on this authored floor.
	var half := _extent(entity, yaw)
	var peers: Array = scene["entities"].filter(func(e): return e["kind"] == "furniture" and e["id"] != entity["id"] and e["floorId"] == entity["floorId"] and e["movement"]["kind"] == "floor")
	peers.sort_custom(func(a, b): return a["id"] < b["id"])
	var keys := {}
	for axis in [0, 2]:
		var nearest := INF
		var correction := 0.0
		var target_mark := 0.0
		var peer_point := Vector3.ZERO
		var held_key := ""
		for peer in peers:
			var position := _v3(peer["position"])
			if Vector2(position.x - point.x, position.z - point.z).length() > 3.0: continue
			var peer_half := _extent(peer, float(peer["yawClockwiseRadians"]))
			for own in [-1, 0, 1]:
				for other in [-1, 0, 1]:
					var target: float = position[axis] + other * peer_half[axis]
					var delta: float = target - (point[axis] + own * half[axis])
					var key := "%s:%d:%d:%d" % [peer["id"], axis, own, other]
					var held: bool = _axis_held.get(axis, "") == key
					var score := absf(delta) - (RELEASE if held else 0.0)
					if absf(delta) <= (RELEASE if held else CAPTURE) and score < nearest:
						nearest = score; correction = delta; target_mark = target; peer_point = position; held_key = key
		if not held_key.is_empty():
			result.point[axis] += correction
			var a: Vector3 = result.point
			var b := peer_point
			a[axis] = target_mark; b[axis] = target_mark; b.y = a.y
			result.guides.append([a, b])
			keys[axis] = held_key
		elif grid_enabled:
			result.point[axis] = snappedf(point[axis], GRID)
	_held = ""
	_axis_held = keys
	result.label = "Furniture aligned" if not keys.is_empty() else ("Grid · 10 cm" if grid_enabled else "")
	return result

func _aperture(scene: Dictionary, wall: Dictionary, entity: Dictionary, along: float, half_width: float) -> bool:
	var length := (_v2(wall["path"]["end"]) - _v2(wall["path"]["start"])).length()
	var floor_y := 0.0
	for floor in scene["floors"]:
		if floor["id"] == entity["floorId"]: floor_y = floor["elevation"]
	var bottom := float(entity["position"][1]) - float(entity["size"][1]) / 2 - floor_y
	for opening in scene["entities"]:
		if opening["kind"] not in ["door", "window"] or opening["hostWallId"] != wall["id"]: continue
		var center := float(opening["pathPosition"]) * length
		var sill := float(opening.get("sillHeight", 0))
		if along + half_width > center - float(opening["width"]) / 2 and along - half_width < center + float(opening["width"]) / 2 and bottom + float(entity["size"][1]) > sill and bottom < sill + float(opening["height"]): return true
	return false

func _extent(entity: Dictionary, yaw: float) -> Vector3:
	var size := _v3(entity["size"]) / 2
	return Vector3(absf(cos(yaw)) * size.x + absf(sin(yaw)) * size.z, size.y, absf(sin(yaw)) * size.x + absf(cos(yaw)) * size.z)

func _v2(value: Array) -> Vector2: return Vector2(value[0], value[1])
func _v3(value: Array) -> Vector3: return Vector3(value[0], value[1], value[2])
