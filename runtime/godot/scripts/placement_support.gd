extends RefCounted

# Pure placement math over compiler floor triangles, never inferred GLB physics.
var _triangles:Dictionary={}
const EPS:=1e-11
func configure(data:Dictionary) -> void:
	_triangles.clear()
	for floor in data["floors"]:
		var rooms:Dictionary={}
		for room in floor["rooms"]:rooms[room["id"]]=true
		var triangles:Array=[]
		for collider in data["colliders"]:
			if collider["kind"]!="triangle-mesh" or collider["floorId"]!=floor["id"] or not rooms.has(collider["ownerId"]):continue
			for i in range(0,collider["indices"].size(),3):
				var triangle:Array=[];var planar:=true
				for j in range(3):
					var point:Array=collider["vertices"][int(collider["indices"][i+j])]
					planar=planar and absf(point[1]-floor["elevation"])<.0000001
					triangle.append([point[0],point[2]])
				if planar:triangles.append({"owner":collider["ownerId"],"points":triangle})
		_triangles[floor["id"]]=triangles

func allowed(entity:Dictionary,pose:Vector3,yaw:float) -> bool:
	var footprint:Array=[];var c:=cos(yaw);var s:=sin(yaw)
	for corner in [Vector2(-1,-1),Vector2(1,-1),Vector2(1,1),Vector2(-1,1)]:
		var x:float=corner.x*float(entity["size"][0])/2;var y:float=corner.y*float(entity["size"][2])/2
		footprint.append([pose.x+c*x-s*y,pose.z+s*x+c*y])
	var supports:Array=[]
	for triangle in _triangles.get(entity["floorId"],[]):
		if entity["movement"]["kind"]!="ceiling" or triangle["owner"]==entity["movement"]["roomId"]:supports.append(triangle["points"])
	if entity.get("representation")=="source-marker" and entity["movement"]["kind"]=="floor":return anchor_supported([pose.x,pose.z],supports)
	return covered(footprint,supports)

static func anchor_supported(point:Array,triangles:Array) -> bool:
	for triangle in triangles:
		if absf(_cross(triangle[0],triangle[1],triangle[2]))<=EPS:continue
		var positive:=true;var negative:=true
		for i in range(3):
			var side:=_cross(triangle[i],triangle[(i+1)%3],point)
			positive=positive and side>=-EPS;negative=negative and side<=EPS
		if positive or negative:return true
	return false

# Vector2 uses 32-bit components in the shipped engine. Keep clipping vertices
# as double scalar arrays so valid triangulation seams leave no false slivers.
static func _cross(a:Array,b:Array,p:Array) -> float:return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
static func _area(polygon:Array) -> float:
	var total:=0.0
	for i in range(polygon.size()):
		var a:Array=polygon[i];var b:Array=polygon[(i+1)%polygon.size()];total+=a[0]*b[1]-a[1]*b[0]
	return absf(total)/2
static func _half(polygon:Array,a:Array,b:Array,inside:bool) -> Array:
	var result:Array=[]
	for i in range(polygon.size()):
		var p:Array=polygon[i];var q:Array=polygon[(i+1)%polygon.size()]
		var pc:=_cross(a,b,p);var qc:=_cross(a,b,q)
		var pin:bool=pc>=-EPS if inside else pc<=EPS;var qin:bool=qc>=-EPS if inside else qc<=EPS
		if pin:result.append(p)
		if pin!=qin:
			var t:=pc/(pc-qc);result.append([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])
	return result
static func covered(footprint:Array,triangles:Array) -> bool:
	var converted:Array=footprint.map(func(point):return [float(point[0]),float(point[1])])
	var remaining:Array=[converted];var tolerance:=maxf(EPS,_area(converted)*.000000001)
	for raw in triangles:
		var triangle:Array=raw.map(func(point):return [float(point[0]),float(point[1])])
		if _cross(triangle[0],triangle[1],triangle[2])<0:triangle.reverse()
		var next:Array=[]
		for fragment in remaining:
			var inside:Array=fragment
			for i in range(3):
				if inside.is_empty():break
				var a:Array=triangle[i];var b:Array=triangle[(i+1)%3]
				var outside:=_half(inside,a,b,false)
				if _area(outside)>tolerance:next.append(outside)
				inside=_half(inside,a,b,true)
		remaining=next
		if remaining.is_empty():return true
	var area:=0.0
	for polygon in remaining:area+=_area(polygon)
	return area<=tolerance
