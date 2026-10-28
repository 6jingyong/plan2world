extends SceneTree

const ARTIFACTS:=preload("res://scripts/runtime_artifacts.gd")
const LOADER:=preload("res://scripts/runtime_loader.gd")
const MAIN:=preload("res://main.tscn")
var failures:=0
func _initialize():run.call_deferred()
func check(value:bool,message:String):
	if not value:failures+=1;push_error(message)
func frames(count:=40):
	for i in range(count):await physics_frame
func walk(count:=90):
	Input.action_press("move_forward");await frames(count);Input.action_release("move_forward");await frames(2)
func obstacle(world:Node,point:Vector3) -> StaticBody3D:
	var body:=StaticBody3D.new();body.position=point;body.set_meta("p2w_owner_id","thin-neighbour")
	var collision:=CollisionShape3D.new();var shape:=BoxShape3D.new();shape.size=Vector3(.001,1,.01);collision.shape=shape;body.add_child(collision);world.add_child(body);return body
func idle(main):
	var deadline:=Time.get_ticks_msec()+30000
	while main._session.busy or main._editing:
		await process_frame;OS.delay_msec(2)
		if Time.get_ticks_msec()>deadline:check(false,"Native door edit must complete");return
	await frames(3)
func run():
	var args:=OS.get_cmdline_user_args()
	if args.size()!=2:push_error("Expected compiled runtime and native Project");quit(2);return
	var data:Dictionary=ARTIFACTS.new().load_runtime(args[0]);if data.is_empty():quit(1);return
	for pair in [["two-track",4.0,10.75],["three-track",8.0,10.5],["four-split",12.0,10.0],["pocket",16.0,10.0],["unequal",20.0,10.0]]:
		var world:=Node3D.new();root.add_child(world);var built:Dictionary=LOADER.new().build(data,world)
		var player:=P2WPlayer.new();world.add_child(player);player.configure(data["playerProfile"],Vector3(pair[2],.4,pair[1]+1.5));await frames(10)
		await walk(45);check(player.position.z>pair[1]+.25,"Closed panels must stop the actual player: "+pair[0])
		player.position=Vector3(pair[2],.4,pair[1]+1.5);player.velocity=Vector3.ZERO;await frames(3)
		player.interact();await frames();check(built["entity_nodes"][pair[0]]._opened,"Player ray must open the shared door: "+pair[0])
		await walk(110);check(player.position.z<pair[1]-.6 and player.is_on_floor(),"Actual grounded player must pass through: "+pair[0])
		if pair[0]=="two-track":
			player.position=Vector3(10.75,.4,4.03);player.velocity=Vector3.ZERO;await frames(3)
			var door=built["entity_nodes"][pair[0]];door.interact();await frames()
			check(door._opened and not door._motions[0]["body"].transform.is_equal_approx(door._motions[0]["closed"]),"A player in the closing path must block the panel")
		world.free();await frames(2)
	# Thin neighbour, fixed panel and converging moving leaves each obstruct in
	# a fresh original world. No player or earlier-open door can hide a failure.
	for mode in ["neighbour","fixed","moving"]:
		var source:Dictionary=data.duplicate(true)
		var id:="three-track" if mode=="moving" else "two-track"
		if mode in ["fixed","moving"]:
			for entity in source["entities"]:
				if entity["id"]!=id:continue
				var leaves:Array=entity["interaction"]["leaves"]
				var changed:Dictionary=leaves[2] if mode=="moving" else leaves[1]
				changed["closedPose"]["center"][2]=leaves[1 if mode=="moving" else 0]["closedPose"]["center"][2]
				for collider in source["colliders"]:
					if collider["id"]==changed["colliderId"]:collider["center"]=changed["closedPose"]["center"].duplicate()
		var world:=Node3D.new();root.add_child(world);var built:Dictionary=LOADER.new().build(source,world)
		if mode=="neighbour":obstacle(world,Vector3(8.8,1.3,4.03))
		await frames(3);var door=built["entity_nodes"][id];door.interact();await frames()
		check(not door._opened,"Door must stop for "+mode+" obstruction")
		world.free();await frames(2)
	var main=MAIN.instantiate();root.add_child(main);await process_frame
	check(main._launcher!=null,"Composition root must finish ready before editing")
	main._open_project(args[1]);await idle(main)
	var world_id:int=main._world.get_instance_id();var player_pose:Transform3D=main._world.get_node("Player").transform
	var other:Node=main._world.find_child("Door_unequal",true,false);var other_id:int=other.get_instance_id()
	other.interact();await frames()
	main._show_door_settings()
	check(paused and main._plan_view.has_open_dialog(),"Native shortcuts must treat shared door settings as a paused modal")
	var settings=main._door_settings;settings._selector.select(0);settings._selector.item_selected.emit(0)
	settings._preset.select(2);settings._preset.item_selected.emit(2)
	settings.confirmed.emit();settings.hide();await idle(main)
	check(main._world.get_instance_id()==world_id and main._world.get_node("Player").transform.is_equal_approx(player_pose),"Door edits must retain world and player")
	check(is_instance_valid(other) and other.get_instance_id()==other_id and other._opened,"Door edits must retain other doors' open state")
	var saved:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(main._session.current()["projectPath"]))
	check(saved["floors"][0]["doors"][1]["leafConfiguration"]["leaves"].size()==3,"Native dialog must commit explicit panel configuration through the shared core")
	var revision:String=main._session.current()["projectPath"]
	main._edit_layout({"type":"door-leaves","floorId":"ground","id":"two-track","configuration":{"kind":"paired","firstLeafRatio":.5}});await idle(main)
	check(main._session.current()["projectPath"]==revision,"Rejected door edit must retain the accepted Project")
	main._session._dirty=false;main.free();await process_frame
	print("Explicit multi-leaf motion / blockers / player routes / native editor: ","PASS" if failures==0 else "FAIL (%d)"%failures);quit(0 if failures==0 else 1)
