extends SceneTree

# Read-only acceptance tool. Build a separate physics world, with no player,
# from compiler colliders. Never change the candidate, presentation or runtime.
const ARTIFACTS=preload("res://scripts/runtime_artifacts.gd")
const LOADER=preload("res://scripts/runtime_loader.gd")

func _initialize() -> void:_run.call_deferred()
func _frames(count:int) -> void:
	for i in range(count):await physics_frame

func _pose_close(a:Transform3D,b:Transform3D) -> bool:
	return a.origin.distance_to(b.origin)<.001 and a.basis.get_rotation_quaternion().angle_to(b.basis.get_rotation_quaternion())<.002

func _blockers(door,body:PhysicsBody3D,pose:Transform3D) -> Array:
	var exclusions:Array[RID]=door.host_exclusions.duplicate()
	for motion in door._motions:exclusions.append(motion["body"].get_rid())
	var collider:=body.get_child(0) as CollisionShape3D
	var query:=PhysicsShapeQueryParameters3D.new();query.shape=collider.shape
	query.transform=body.get_parent().global_transform*pose*collider.transform;query.collision_mask=1;query.exclude=exclusions;query.margin=0
	var owners:Array=[]
	for hit in body.get_world_3d().direct_space_state.intersect_shape(query,128):
		var owner=str(hit["collider"].get_meta("p2w_owner_id",""))
		if not owners.has(owner):owners.append(owner)
	owners.sort();return owners

func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.size()!=2:push_error("Usage: runtime-door-audit.gd -- scene.runtime.json report.json");quit(1);return
	var data:Dictionary=ARTIFACTS.new().load_runtime(args[0])
	if data.is_empty():quit(1);return
	var results:Array=[];var failed:=false;var unsupported:=false
	for entity in data["entities"]:
		if entity["kind"]!="door":continue
		var kind:String=entity["interaction"]["kind"]
		var result:Dictionary={"id":entity["id"],"floorId":entity["floorId"],"sourceType":entity["doorType"],"motion":kind}
		if kind=="none":result.merge({"status":"pass","scope":"leafless passage; no moving leaf"});results.append(result);continue
		if kind=="unsupported":result.merge({"status":"review_required","sourceMotion":entity["interaction"]["sourceMotion"]});unsupported=true;results.append(result);continue
		# Each door starts in the original closed scene. Earlier audits cannot
		# open an obstruction or make the next door's test artificially pass.
		var world:=Node3D.new();root.add_child(world)
		var built:Dictionary=LOADER.new().build(data,world)
		await _frames(3)
		var door=built["entity_nodes"][entity["id"]]
		door.interact();await _frames(45)
		var leaves:Array=[];var fully_open:bool=door._opened
		for index in range(door._motions.size()):
			var motion:Dictionary=door._motions[index];var body:PhysicsBody3D=motion["body"]
			var actual:Transform3D=body.transform;var target:Transform3D=motion["open"];var closed:Transform3D=motion["closed"]
			var complete:=_pose_close(actual,target);fully_open=fully_open and complete
			leaves.append({"id":body.get_meta("p2w_leaf_id"),"fullyOpen":complete,
				"requestedTravel":closed.origin.distance_to(target.origin),"actualTravel":closed.origin.distance_to(actual.origin),
				"requestedAngle":closed.basis.get_rotation_quaternion().angle_to(target.basis.get_rotation_quaternion()),"actualAngle":closed.basis.get_rotation_quaternion().angle_to(actual.basis.get_rotation_quaternion()),
				"openPoseBlockers":_blockers(door,body,target),"nextPoseBlockers":_blockers(door,body,actual.interpolate_with(target,.05))})
		for leaf in entity["interaction"]["leaves"]:
			if leaf.get("fixed",false):
				var body:PhysicsBody3D=built["leaf_nodes"][leaf["id"]]
				var unchanged:bool=body.position.distance_to(Vector3(leaf["closedPose"]["center"][0],leaf["closedPose"]["center"][1],leaf["closedPose"]["center"][2]))<.00001
				fully_open=fully_open and unchanged
				leaves.append({"id":leaf["id"],"fixed":true,"unchanged":unchanged,"fullyOpen":unchanged,"requestedTravel":0,"actualTravel":0})
		door.interact();await _frames(45)
		var fully_closed:bool=not door._opened and not door._target_open
		for motion in door._motions:fully_closed=fully_closed and _pose_close(motion["body"].transform,motion["closed"])
		var status:="pass" if fully_open and fully_closed else "fail";failed=failed or status=="fail"
		result.merge({"status":status,"fullyOpen":fully_open,"fullyClosed":fully_closed,"leaves":leaves});results.append(result)
		world.free();await _frames(2)
	var report:Dictionary={"schemaVersion":"plan2world-door-motion-audit-v1","status":"fail" if failed else "review_required" if unsupported else "pass",
		"scope":"isolated original closed physics world per door; no player; motion only, not route reachability or source fidelity","doors":results}
	var file:=FileAccess.open(args[1],FileAccess.WRITE)
	if file==null:push_error("Could not write door audit.");quit(1);return
	file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	print("Every-door motion audit: ",report["status"]," (",results.size()," doors/passages)")
	quit(0)
