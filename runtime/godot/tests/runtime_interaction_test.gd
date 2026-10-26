extends SceneTree

const PLAYER=preload("res://scripts/player.gd")
class Target extends Node3D:
	var calls:=0
	func interact(_actor=null):calls+=1
var failures:=0
func _initialize():run.call_deferred()
func check(value:bool,message:String):
	if not value:failures+=1;push_error(message)
func frames():
	for i in range(3):await physics_frame
func press_e():
	var key:=InputEventKey.new();key.keycode=KEY_E;key.physical_keycode=KEY_E;key.pressed=true
	root.push_input(key,true);key.pressed=false;root.push_input(key,true)
func box(parent:Node,position:Vector3,size:Vector3) -> StaticBody3D:
	var body:=StaticBody3D.new();body.position=position
	var collision:=CollisionShape3D.new();var shape:=BoxShape3D.new();shape.size=size;collision.shape=shape;body.add_child(collision);parent.add_child(body)
	return body
func run():
	var world:=Node3D.new();root.add_child(world)
	var target:=Target.new();world.add_child(target)
	# Two explicit leaves retain a sub-millimetre physical seam. Aim assistance
	# must pick the shared interaction target without inflating those colliders.
	for side in [-1,1]:box(target,Vector3(side*.45005,1.4,0),Vector3(.9,2.8,.04)).set_meta("p2w_interaction_target",target)
	var player=PLAYER.new();world.add_child(player);player.configure({},Vector3(0,0,1.5));player.set_physics_process(false);await frames()
	press_e();await frames();check(target.calls==1,"Aiming exactly at a paired seam must interact once, with the player excluded")
	var blocker:=box(world,Vector3(0,1.4,.7),Vector3(2,2.8,.1));await frames()
	press_e();await frames();check(target.calls==1,"Aim tolerance must not interact through a nearer wall")
	blocker.free();player.position.z=3;await frames()
	press_e();await frames();check(target.calls==1,"Aim tolerance must retain the interaction reach")
	world.free();print("Native door seam / actor exclusion / wall occlusion / interaction reach: ","PASS" if failures==0 else "FAIL");quit(0 if failures==0 else 1)
