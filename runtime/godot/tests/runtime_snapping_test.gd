extends SceneTree

const SNAPPING := preload("res://scripts/furniture_snapping.gd")
var failures := 0
func _initialize(): _run.call_deferred()
func _check(value: bool, text: String):
	if not value: failures += 1; push_error(text)
func _run():
	var solver := SNAPPING.new()
	var item := {"id":"piece","floorId":"f","kind":"furniture","movement":{"kind":"floor","elevation":0},"position":[4,.5,2],"size":[2,1,1],"yawClockwiseRadians":0}
	var wall := {"id":"w","floorId":"f","kind":"wall","visible":true,"boundaryType":"solid","thickness":.2,"path":{"start":[0,0],"end":[10,0]}}
	var scene := {"floors":[{"id":"f","elevation":0}],"entities":[wall,item]}
	var result := solver.solve(scene,item,Vector3(4.03,.5,.64),.3)
	_check(result.point.is_equal_approx(Vector3(4,.5,.6)) and is_zero_approx(result.yaw) and result.label=="Wall aligned","Wall snap uses effective depth, thickness, along-grid and facing")
	item["mirror"]=[1,1,-1]
	result=solver.solve(scene,item,Vector3(4.03,.5,.64),.3)
	_check(is_equal_approx(result.yaw,PI) and is_equal_approx(result.point.z,.6),"Depth-mirrored native furniture must keep its real back against the wall")
	item.erase("mirror")
	result=solver.solve(scene,item,Vector3(4.03,.5,.70),.3)
	_check(result.label=="Wall aligned","Captured wall must hold within the larger release tolerance")
	result=solver.solve(scene,item,Vector3(4.03,.5,.74),.3)
	_check(result.label=="Grid · 10 cm","A wall must release beyond 12 cm")
	result=solver.solve(scene,item,Vector3(4.03,.5,-.64),.3)
	_check(is_equal_approx(result.point.z,-.6) and is_equal_approx(result.yaw,PI),"Other wall side must face away from the wall")
	result=solver.solve(scene,item,Vector3(4.03,.5,.64),.3,true)
	_check(result.point==Vector3(4.03,.5,.64) and is_equal_approx(result.yaw,.3) and result.label.is_empty(),"Temporary release must restore exact free position and orientation")
	wall.path["control"]=[5,1]
	result=solver.solve(scene,item,Vector3(4.03,.5,.64),.3)
	_check(result.label=="Grid · 10 cm","Curves must not be guessed as straight walls")
	wall.path.erase("control");wall.boundaryType="air"
	_check(solver.solve(scene,item,Vector3(4.03,.5,.64),0).label!="Wall aligned","Invisible air boundaries must not attract furniture")
	wall.boundaryType="solid"; wall.floorId="other"
	_check(solver.solve(scene,item,Vector3(4.03,.5,.64),0).label!="Wall aligned","Other floors must not attract furniture")
	wall.floorId="f"
	var opening: Dictionary={"id":"d","kind":"door","hostWallId":"w","pathPosition":.4,"width":1,"height":2}
	scene.entities.append(opening)
	_check(solver.solve(scene,item,Vector3(4.03,.5,.64),0).label!="Wall aligned","Door and leafless-passage apertures are not wall snap surfaces")
	scene.entities.erase(opening)
	opening={"id":"g","kind":"window","hostWallId":"w","pathPosition":.4,"width":1,"height":1,"sillHeight":.8}
	scene.entities.append(opening)
	_check(solver.solve(scene,item,Vector3(4.03,.5,.64),0).label!="Wall aligned","Windows intersecting the piece height cannot attract its back edge")
	item.size[1]=.5;item.position[1]=.25
	_check(solver.solve(scene,item,Vector3(4.03,.25,.64),0).label=="Wall aligned","Low furniture may align to a real wall below the sill")
	scene.entities.erase(opening);item.size=[2,1,1];item.position=[4,.5,2]
	wall.path={"start":[0,0],"end":[10,10]};solver.clear();solver.grid_enabled=false
	var t:=Vector2(1,1).normalized();var n:=Vector2(-t.y,t.x);var point:=t*4+n*.63
	result=solver.solve(scene,item,Vector3(point.x,.5,point.y),0)
	_check(is_equal_approx(Vector2(result.point.x,result.point.z).dot(n),.6) and is_equal_approx(result.yaw,PI/4),"Diagonal walls retain exact physical clearance and orientation without axis rounding")
	scene.entities=[item,{"id":"peer","floorId":"f","kind":"furniture","movement":{"kind":"floor"},"position":[4,.5,4],"size":[2,1,1],"yawClockwiseRadians":0}]
	solver.clear();result=solver.solve(scene,item,Vector3(6.04,.5,4.03),0)
	_check(result.point.is_equal_approx(Vector3(6,.5,4)) and result.label=="Furniture aligned" and result.guides.size()==2,"Nearby footprint edges and centres align independently on both axes")
	solver.clear();scene.entities.reverse()
	_check(solver.solve(scene,item,Vector3(6.04,.5,4.03),0)==result,"Entity input order cannot change snap selection or guide order")
	item.movement={"kind":"wall","origin":[0,0,.12],"tangent":[1,0,0],"along":[1,9],"bottom":[0,2],"wallId":"chosen"}
	solver.grid_enabled=true;result=solver.solve(scene,item,Vector3(4.03,1.47,.12),.7)
	_check(result.point.is_equal_approx(Vector3(4,1.47,.12)) and is_equal_approx(result.yaw,.7) and item.movement.wallId=="chosen","Mounted pieces only grid-snap along the chosen host, retaining height and orientation")
	solver.enabled=false
	_check(solver.solve(scene,item,Vector3(4.03,1.47,.12),.7).point==Vector3(4.03,1.47,.12),"Disabled snapping is exact free movement")
	print("Runtime semantic furniture snapping: ","PASS" if failures==0 else "FAIL (%d)"%failures)
	quit(0 if failures==0 else 1)
