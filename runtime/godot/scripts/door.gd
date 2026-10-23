extends AnimatableBody3D
class_name P2WDoor

var _motion_kind := "swing"
var _closed_yaw := 0.0
var _open_yaw := 0.0
var _closed_position := Vector3.ZERO
var _open_position := Vector3.ZERO
var _opened := false
var _busy := false
var _duration := 0.45

func configure_swing(open_delta_radians: float, duration_seconds: float = 0.45) -> void:
	_motion_kind = "swing"
	_closed_yaw = rotation.y
	_open_yaw = _closed_yaw + open_delta_radians
	_duration = max(0.05, duration_seconds)
	_opened = false
	sync_to_physics = true
	set_meta("p2w_motion_kind", _motion_kind)

func configure_slide(axis: Vector3, travel: float, duration_seconds: float = 0.45) -> void:
	_motion_kind = "slide"
	_closed_position = position
	var direction := axis.normalized() if axis.length_squared() > 0.000001 else Vector3.ZERO
	_open_position = _closed_position + direction * max(0.0, travel)
	_duration = max(0.05, duration_seconds)
	_opened = false
	sync_to_physics = true
	set_meta("p2w_motion_kind", _motion_kind)

func interact(_actor: Node = null) -> void:
	if _busy:
		return
	_busy = true
	_opened = not _opened
	var tween := create_tween()
	tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_IN_OUT)
	if _motion_kind == "slide":
		var target_position := _closed_position
		if _opened:
			target_position = _open_position
		tween.tween_property(self, "position", target_position, _duration)
	else:
		var target_yaw := _closed_yaw
		if _opened:
			target_yaw = _open_yaw
		tween.tween_property(self, "rotation:y", target_yaw, _duration)
	tween.finished.connect(func() -> void: _busy = false)
