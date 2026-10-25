extends RefCounted

# Validate the consumer's required runtime contract before constructing nodes.
# No authoring data, geometry repair, topology or presentation inference.
static func valid(data: Dictionary) -> bool:
	if data.get("schema") != "plan2world-runtime-v1" or data.get("version") != 1 or data.get("units") != "metres": return false
	if data.get("coordinates") != { "handedness": "right", "up": "+Y", "planX": "+X", "planY": "+Z", "yaw": "clockwise-from-+X" }: return false
	var source = data.get("source")
	if not source is Dictionary or not _id(source.get("projectId")) or not source.get("projectName") is String: return false
	if source.has("architectureSha256") and (not source["architectureSha256"] is String or RegEx.create_from_string("^[a-f0-9]{64}$").search(source["architectureSha256"]) == null): return false
	var profile = data.get("playerProfile")
	if not profile is Dictionary or not _positive(profile.get("eyeHeight")) or not _positive(profile.get("radius")): return false
	var speeds = profile.get("speeds")
	if not speeds is Dictionary: return false
	for key in ["slow", "walk", "fast"]:
		if not _nonnegative(speeds.get(key)): return false
	for key in ["floors", "entities", "colliders"]:
		if not data.get(key) is Array: return false
	var floors := {}
	var owners := {}
	var rooms := {}
	for floor in data["floors"]:
		if not floor is Dictionary or not _unique(floor.get("id"), floors) or not floor.get("name") is String or not _number(floor.get("level")) or floor["level"] != floor["level"] as int or not _number(floor.get("elevation")): return false
		if not floor.get("rooms") is Array or not floor.has("walkthroughStart") or (floor["walkthroughStart"] != null and not vector(floor["walkthroughStart"], 3)): return false
		if floor.has("walkthroughYawClockwiseRadians") and not _number(floor["walkthroughYawClockwiseRadians"]): return false
		if floor.has("entranceDoorId") and not _id(floor["entranceDoorId"]): return false
		for room in floor["rooms"]:
			if not room is Dictionary or not _unique(room.get("id"), owners): return false
			owners[room["id"]] = floor["id"]
			rooms[room["id"]] = true
			if not room.get("name") is String or room.get("roomType") not in ["indoor", "outdoor", "garage", "utility"] or not _polygon(room.get("polygon")) or not room.get("holes") is Array or not _positive(room.get("slabThickness")): return false
			if not room.has("ceilingHeight") or (room["ceilingHeight"] != null and not _nonnegative(room["ceilingHeight"])): return false
			for hole in room["holes"]:
				if not _polygon(hole): return false
	var entities := {}
	for entity in data["entities"]:
		if not entity is Dictionary or not _unique(entity.get("id"), owners) or not floors.has(entity.get("floorId")): return false
		owners[entity["id"]] = entity["floorId"]
		entities[entity["id"]] = entity
		match entity.get("kind"):
			"wall":
				var path = entity.get("path")
				if not path is Dictionary or not vector(path.get("start"), 2) or not vector(path.get("end"), 2) or (path.has("control") and not vector(path["control"], 2)): return false
				if not _positive(entity.get("thickness")) or not _nonnegative(entity.get("startHeight")) or not _nonnegative(entity.get("endHeight")) or entity.get("boundaryType") not in ["solid", "railing", "air"] or not entity.get("visible") is bool: return false
			"furniture":
				if not _id(entity.get("catalogId")) or not _id(entity.get("assetRef")) or not vector(entity.get("position"), 3) or not _number(entity.get("yawClockwiseRadians")) or not vector(entity.get("size"), 3, true): return false
				var motion = entity.get("movement")
				if not entity.get("locked") is bool or not motion is Dictionary: return false
				if motion.get("kind") == "floor":
					if not _number(motion.get("elevation")): return false
				elif motion.get("kind") == "wall":
					if not _id(motion.get("wallId")) or not vector(motion.get("origin"),3) or not vector(motion.get("tangent"),3) or not vector(motion.get("along"),2) or not vector(motion.get("bottom"),2): return false
					if motion.get("side") not in ["left", "right"] or not motion.get("blocked") is Array: return false
					for opening in motion["blocked"]:
						if not opening is Dictionary or not vector(opening.get("along"),2) or not vector(opening.get("bottom"),2): return false
					if motion["along"][0] > motion["along"][1] or motion["bottom"][0] > motion["bottom"][1]: return false
				elif motion.get("kind") != "unbound-wall": return false
				if entity.has("mirror") and not vector(entity["mirror"], 3): return false
			"column":
				if entity.get("shape") not in ["square", "round"] or not vector(entity.get("position"), 3) or not _number(entity.get("yawClockwiseRadians")) or not _positive(entity.get("diameter")) or not _positive(entity.get("height")): return false
			"door", "window":
				if not _id(entity.get("hostWallId")) or not _number(entity.get("pathPosition")) or not _positive(entity.get("width")) or not _positive(entity.get("height")): return false
				if entity["kind"] == "window" and (not vector(entity.get("center"), 3) or not _number(entity.get("yawClockwiseRadians")) or not _nonnegative(entity.get("sillHeight"))): return false
			"stair":
				if not vector(entity.get("position"), 3) or not _number(entity.get("yawClockwiseRadians")) or not _positive(entity.get("width")) or not _positive(entity.get("depth")) or not _positive(entity.get("riserCount")) or entity.get("direction") not in ["up", "down"] or entity.get("stairType") not in ["straight", "l-shaped", "u-shaped", "spiral"]: return false
				var traversal = entity.get("traversal")
				if not traversal is Dictionary: return false
				if traversal.get("kind") == "ramp":
					if not floors.has(traversal.get("targetFloorId")) or not _number(traversal.get("startElevation")) or not _number(traversal.get("endElevation")): return false
				elif traversal.get("kind") != "unsupported" or traversal.get("reason") not in ["missing-target-floor", "invalid-target-elevation", "invalid-geometry", "non-straight"]: return false
			_: return false
	for entity in data["entities"]:
		if entity["kind"] == "furniture" and entity["movement"]["kind"] == "wall":
			var wall: Dictionary = entities.get(entity["movement"]["wallId"], {})
			if wall.get("kind") != "wall" or wall.get("floorId") != entity["floorId"]: return false
		if entity["kind"] in ["door", "window"]:
			var host: Dictionary = entities.get(entity["hostWallId"], {})
			if host.get("kind") != "wall" or host.get("floorId") != entity["floorId"]: return false
	for floor in data["floors"]:
		if floor.has("entranceDoorId"):
			var entrance: Dictionary = entities.get(floor["entranceDoorId"], {})
			if entrance.get("kind") != "door" or entrance.get("floorId") != floor["id"] or floor["walkthroughStart"] == null or not floor.has("walkthroughYawClockwiseRadians"): return false
	var colliders := {}
	var surfaces := {}
	for collider in data["colliders"]:
		if not collider is Dictionary or not _unique(collider.get("id"), colliders) or not collider.get("dynamic") is bool or not floors.has(collider.get("floorId")) or owners.get(collider.get("ownerId")) != collider["floorId"]: return false
		colliders[collider["id"]] = collider
		match collider.get("kind"):
			"box":
				if not vector(collider.get("center"), 3) or not vector(collider.get("size"), 3, true) or not _number(collider.get("yawClockwiseRadians")): return false
			"cylinder":
				if not vector(collider.get("center"), 3) or not _positive(collider.get("radius")) or not _positive(collider.get("height")): return false
			"triangle-mesh":
				if not collider.get("vertices") is Array or collider["vertices"].size() < 3 or not collider.get("indices") is Array or collider["indices"].size() < 3 or collider["indices"].size() % 3 != 0: return false
				for vertex in collider["vertices"]:
					if not vector(vertex, 3): return false
				for index in collider["indices"]:
					if not _nonnegative(index) or index != index as int or index >= collider["vertices"].size(): return false
				if rooms.has(collider["ownerId"]): surfaces[collider["ownerId"]] = true
			_: return false
	for room in rooms:
		if not surfaces.has(room): return false
	return _valid_doors(data)

static func _valid_doors(data: Dictionary) -> bool:
	var colliders := {}
	for collider in data["colliders"]:
		colliders[collider["id"]] = collider
	var ids := {}
	for entity in data["entities"]:
		if entity.get("kind") != "door": continue
		if not _pose(entity.get("closedPose")): return false
		var motion = entity.get("interaction")
		if not motion is Dictionary: return false
		var kind = motion.get("kind")
		if kind == "none": continue
		if kind not in ["swing", "slide", "unsupported"] or not motion.get("leaves") is Array or motion["leaves"].is_empty(): return false
		for leaf in motion["leaves"]:
			if not leaf is Dictionary or not _unique(leaf.get("id"), ids) or not _id(leaf.get("assetRef")) or not vector(leaf.get("size"), 3, true) or not _pose(leaf.get("closedPose")): return false
			var collider: Dictionary = colliders.get(leaf.get("colliderId"), {})
			if collider.get("ownerId") != entity.get("id") or collider.get("kind") != "box" or collider.get("dynamic") != true: return false
			if kind == "swing" and (not vector(leaf.get("pivot"), 3) or not vector(leaf.get("axis"), 3) or Vector3(leaf["axis"][0], leaf["axis"][1], leaf["axis"][2]) != Vector3.UP or not _number(leaf.get("openAngleRadians"))): return false
			if kind == "slide" and (not vector(leaf.get("axis"), 3) or not _positive(leaf.get("travel"))): return false
	return true

static func _pose(value) -> bool:
	return value is Dictionary and vector(value.get("center"), 3) and _number(value.get("yawClockwiseRadians"))
static func vector(value, length: int, nonnegative := false) -> bool:
	if not value is Array or value.size() != length: return false
	for number in value:
		if not _number(number) or (nonnegative and number < 0): return false
	return true
static func _polygon(value) -> bool:
	if not value is Array or value.size() < 3: return false
	for point in value:
		if not vector(point, 2): return false
	return true
static func _number(value) -> bool:
	return typeof(value) in [TYPE_INT, TYPE_FLOAT] and is_finite(float(value))
static func _positive(value) -> bool:
	return _number(value) and value > 0
static func _nonnegative(value) -> bool:
	return _number(value) and value >= 0
static func _id(value) -> bool:
	return value is String and not value.is_empty()
static func _unique(value, collection: Dictionary) -> bool:
	if not _id(value) or collection.has(value): return false
	collection[value] = true
	return true
