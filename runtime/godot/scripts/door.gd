extends Node3D
class_name P2WDoor

# One interaction state per native door, however many physical leaves it has.
# Leaf motion targets are supplied by the loader from the compiler contract.
var _motions: Array[Dictionary] = []
var _opened := false
var _busy := false
var _duration := 0.45

func configure_swing(body: AnimatableBody3D, open_delta_radians: float) -> void:
	_motions.append({ "body": body, "property": "rotation:y", "closed": body.rotation.y, "open": body.rotation.y + open_delta_radians })

func configure_slide(body: AnimatableBody3D, axis: Vector3, travel: float) -> void:
	_motions.append({ "body": body, "property": "position", "closed": body.position, "open": body.position + axis * travel })

func interact(_actor: Node = null) -> void:
	if _busy:
		return
	_busy = true
	_opened = not _opened
	var tween := create_tween().set_parallel(true)
	tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_IN_OUT)
	for motion in _motions:
		tween.tween_property(motion["body"], motion["property"], motion["open"] if _opened else motion["closed"], _duration)
	tween.finished.connect(func() -> void: _busy = false)
