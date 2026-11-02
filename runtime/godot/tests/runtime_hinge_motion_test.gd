extends SceneTree

const ARTIFACTS=preload("res://scripts/runtime_artifacts.gd")
const LOADER=preload("res://scripts/runtime_loader.gd")
var failures:=0
func _initialize():run.call_deferred()
func check(value:bool,message:String):
	if not value:failures+=1;push_error(message)
func frames(count:int):
	for i in range(count):await physics_frame
func run():
	var args:=OS.get_cmdline_user_args()
	if args.size()!=1:push_error("Expected authored multileaf runtime");quit(2);return
	var data:Dictionary=ARTIFACTS.new().load_runtime(args[0])
	if data.is_empty():quit(1);return
	for id in ["corner-clear","corner-blocked"]:
		var world:=Node3D.new();root.add_child(world)
		var built:Dictionary=LOADER.new().build(data,world)
		await frames(3)
		var door=built["entity_nodes"][id]
		var closed:Transform3D=door._motions[0]["body"].transform
		door.interact();await frames(45)
		if id=="corner-clear":
			check(door._opened,"A rotating leaf must clear the adjacent return without a fixed-orientation translation sweep")
			var actual:Transform3D=door._motions[0]["body"].transform
			var target:Transform3D=door._motions[0]["open"]
			check(actual.basis.get_rotation_quaternion().angle_to(target.basis.get_rotation_quaternion())<.002,"Clear hinge must reach its full authored angle")
			door.interact();await frames(45)
			check(not door._opened and door._motions[0]["body"].transform.is_equal_approx(closed),"Clear hinge must close fully")
		else:
			check(not door._opened and not door._busy,"An actual obstacle inside the rotation arc must still stop the leaf")
		world.free();await frames(2)
	print("Hinged rotation clearance and actual arc obstruction: ","PASS" if failures==0 else "FAIL")
	quit(0 if failures==0 else 1)
