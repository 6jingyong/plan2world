extends SceneTree
const SUPPORT:=preload("res://scripts/placement_support.gd")
const MAIN:=preload("res://main.tscn")
var failures:=0
func _initialize():run.call_deferred()
func check(value:bool,text:String):
	if not value:failures+=1;push_error(text)
func rectangle(x:float,y:float,w:float,h:float) -> Array:
	return [[Vector2(x,y),Vector2(x+w,y),Vector2(x+w,y+h)],[Vector2(x,y),Vector2(x+w,y+h),Vector2(x,y+h)]]
func idle(main):
	while main._session.busy or main._editing:await process_frame;OS.delay_msec(2)
	for i in range(3):await physics_frame
func run():
	var footprint:Array=[Vector2(0,0),Vector2(2,0),Vector2(2,2),Vector2(0,2)]
	check(SUPPORT.covered(footprint,rectangle(0,0,1,2)+rectangle(1,0,1,2)),"Adjoining floor union must fully support a piece")
	var split:=rectangle(0,0,.4,2)+rectangle(.42,0,1.58,2)
	check(not SUPPORT.covered(footprint,split+split),"Duplicated floor triangles cannot conceal a narrow hole")
	var ring:=rectangle(0,0,2,.4)+rectangle(0,.6,2,1.4)+rectangle(0,.4,.4,.2)+rectangle(.6,.4,1.4,.2)
	check(not SUPPORT.covered(footprint,ring),"A hole wholly inside the footprint must be rejected")
	for polygon in ring:
		for i in range(polygon.size()):polygon[i]=polygon[i].rotated(.6)
	for i in range(footprint.size()):footprint[i]=footprint[i].rotated(.6)
	check(not SUPPORT.covered(footprint,ring),"Rotated footprint/holes must retain the same result")
	var triangle:Array=[[0.0,0.0],[2.0,0.0],[0.0,2.0]]
	check(SUPPORT.anchor_supported([0.0,1.0],[triangle]),"Source anchor may touch the true floor boundary")
	triangle.reverse();check(SUPPORT.anchor_supported([0.0,1.0],[triangle]),"Anchor support is independent of triangle winding")
	check(not SUPPORT.anchor_supported([1.1,1.1],[triangle]),"Anchor outside a support triangle is not accepted")
	check(not SUPPORT.anchor_supported([0.0,0.0],[[[0.0,0.0],[0.0,0.0],[0.0,0.0]]]),"Degenerate triangles never support anchors")
	var args:=OS.get_cmdline_user_args()
	if args.size()!=1:push_error("Expected valid native support Project");quit(2);return
	var main=MAIN.instantiate();root.add_child(main);await process_frame
	check(main._launcher!=null,"Composition root must finish ready before support checks")
	main._open_project(args[0]);await idle(main)
	var revision:String=main._session.current()["projectPath"];var world:int=main._world.get_instance_id()
	check(not main._layout_camera.placement_allowed(main._runtime_data,"sofa",Vector3(-1,0,0)),"Engine preview must reject a narrow hole missed by the old five probes")
	main._edit_layout({"type":"move","floorId":"ground","id":"sofa","position":{"x":500,"y":200}});await idle(main)
	check(main._session.current()["projectPath"]==revision and main._world.get_instance_id()==world,"Shared core must reject unsupported candidate without changing source/world")
	var other_model:int=main._furniture_models["custom"].get_instance_id();var other_area:int=main._layout_camera._pick_areas["custom"].get_instance_id()
	main._edit_layout({"type":"move","floorId":"ground","id":"sofa","position":{"x":580,"y":200}});await idle(main)
	check(main._session.current()["projectPath"]!=revision,"A supported accepted move must commit")
	check(main._furniture_models["custom"].get_instance_id()==other_model and main._layout_camera._pick_areas["custom"].get_instance_id()==other_area,"Single-item edits must preserve unchanged model and picking nodes")
	main._session._dirty=false;main.free();await process_frame
	print("Complete footprint support / thin holes / concave union / atomic candidate rejection: ","PASS" if failures==0 else "FAIL");quit(0 if failures==0 else 1)
