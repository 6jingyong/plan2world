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
	if _busy: return
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
	var poses: Array[Transform3D] = []
	for motion in _motions:
		var pose: Transform3D = motion["from"].interpolate_with(motion["open"] if _target_open else motion["closed"], weight)
		var body := motion["body"] as AnimatableBody3D
		var collider := body.get_child(0) as CollisionShape3D
		var shape := BoxShape3D.new()
		shape.size = (collider.shape as BoxShape3D).size * 0.999
		var query := PhysicsShapeQueryParameters3D.new()
		query.shape = shape
		query.transform = body.get_parent().global_transform * pose * collider.transform
		query.exclude = exclusions
		query.collision_mask = 1
		query.margin = 0.0
		if not get_world_3d().direct_space_state.intersect_shape(query, 1).is_empty():
			_tween.kill()
			_busy = false
			return
		poses.append(pose)
	for i in range(_motions.size()): _motions[i]["body"].transform = poses[i]
