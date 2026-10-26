extends Node3D
class_name P2WDoor

# Compiler-owned leaf transforms; Godot owns movement and obstruction queries.
var _motions: Array[Dictionary] = []
var _opened := false
var _target_open := false
var _busy := false
var _tween: Tween
var host_exclusions: Array[RID] = []
var _duration := 0.45

func configure_swing(body: AnimatableBody3D, open_delta_radians: float) -> void:
	var opened := body.transform
	opened.basis = Basis(Vector3.UP, open_delta_radians) * opened.basis
	_motions.append({ "body": body, "closed": body.transform, "open": opened })

func configure_slide(body: AnimatableBody3D, axis: Vector3, travel: float) -> void:
	var opened := body.transform
	opened.origin += axis * travel
	_motions.append({ "body": body, "closed": body.transform, "open": opened })

func interact(_actor: Node = null) -> void:
	if _busy or _motions.is_empty(): return
	_busy = true
	_target_open = not _target_open
	for motion in _motions: motion["from"] = motion["body"].transform
	_tween = create_tween().set_parallel(true)
	_tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_tween.tween_method(_advance, 0.0, 1.0, _duration)
	_tween.finished.connect(func():
		_opened = _target_open
		_busy = false)

func _advance(weight: float) -> void:
	var exclusions: Array[RID] = host_exclusions.duplicate()
	for motion in _motions: exclusions.append(motion["body"].get_rid())
	var starts: Array[Transform3D] = []
	var targets: Array[Transform3D] = []
	var steps := 1
	for motion in _motions:
		var target: Transform3D = motion["from"].interpolate_with(motion["open"] if _target_open else motion["closed"], weight)
		var start: Transform3D = motion["body"].transform
		starts.append(start); targets.append(target)
		var angle := start.basis.get_rotation_quaternion().angle_to(target.basis.get_rotation_quaternion())
		steps = maxi(steps, maxi(ceili(start.origin.distance_to(target.origin)/.01), ceili(angle/.01)))
	for step in range(1,steps+1):
		var poses: Array[Transform3D] = []
		for i in range(_motions.size()): poses.append(starts[i].interpolate_with(targets[i],float(step)/steps))
		if not _poses_clear(poses,exclusions):
			_tween.kill(); _busy=false
			return
		for i in range(_motions.size()): _motions[i]["body"].transform = poses[i]

func _poses_clear(poses: Array[Transform3D], exclusions: Array[RID]) -> bool:
	var boxes: Array[Dictionary] = []
	for i in range(_motions.size()):
		var motion: Dictionary = _motions[i]
		var body := motion["body"] as AnimatableBody3D
		var collider := body.get_child(0) as CollisionShape3D
		var shape := BoxShape3D.new()
		shape.size = (collider.shape as BoxShape3D).size * .999
		var query := PhysicsShapeQueryParameters3D.new()
		query.shape = shape
		query.transform = body.get_parent().global_transform * poses[i] * collider.transform
		query.exclude = exclusions
		query.collision_mask = 1
		query.margin = 0.0
		if not get_world_3d().direct_space_state.intersect_shape(query, 1).is_empty():
			return false
		# A translating panel cannot jump over a thin obstacle between frames.
		var finish := query.transform
		query.transform = body.global_transform * collider.transform
		query.motion = finish.origin-query.transform.origin
		if not query.motion.is_zero_approx():
			var cast := get_world_3d().direct_space_state.cast_motion(query)
			if cast[1] < 1.0-.000001: return false
		boxes.append({"pose":finish,"size":shape.size})
	# Moving leaves are excluded from world queries only because they must be
	# compared at the SAME candidate time. Fixed panels remain real obstacles.
	for i in range(boxes.size()):
		for j in range(i):
			if _overlap(boxes[i],boxes[j]): return false
	return true

func _overlap(a: Dictionary, b: Dictionary) -> bool:
	var at: Transform3D=a["pose"]; var bt: Transform3D=b["pose"]
	var az: Vector3=a["size"]; var bz: Vector3=b["size"]
	if absf(at.origin.y-bt.origin.y)>=(az.y+bz.y)/2: return false
	var delta:=bt.origin-at.origin
	for axis in [at.basis.x,at.basis.z,bt.basis.x,bt.basis.z]:
		var ar:float=(absf(axis.dot(at.basis.x))*az.x+absf(axis.dot(at.basis.z))*az.z)/2
		var br:float=(absf(axis.dot(bt.basis.x))*bz.x+absf(axis.dot(bt.basis.z))*bz.z)/2
		# Connected paired slabs meet at a mathematical seam. Their rectangular
		# thickness needs sub-millimetre contact tolerance during the first swing;
		# actual bodies retain the compiler's full size.
		if absf(delta.dot(axis))>=ar+br-.001: return false
	return true
