extends AnimatableBody3D
class_name P2WDoor

var _closed_yaw := 0.0
var _open_yaw := 0.0
var _opened := false
var _busy := false
var _duration := 0.45

func configure(open_delta_radians: float, duration_seconds: float = 0.45) -> void:
	_closed_yaw = rotation.y
	_open_yaw = _closed_yaw + open_delta_radians
	_duration = max(0.05, duration_seconds)
	sync_to_physics = true

func interact(_actor: Node = null) -> void:
	if _busy:
		return
	_busy = true
	_opened = not _opened
	var target := _open_yaw if _opened else _closed_yaw
	var tween := create_tween()
	tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(self, "rotation:y", target, _duration)
	tween.finished.connect(func() -> void: _busy = false)
