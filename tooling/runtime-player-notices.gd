extends SceneTree

func _initialize() -> void:
	var file := FileAccess.open(OS.get_cmdline_user_args()[0], FileAccess.WRITE)
	if file == null:
		quit(1)
		return
	file.store_string(Engine.get_license_text() + "\n\n" + JSON.stringify(Engine.get_copyright_info(), "\t") + "\n\n" + JSON.stringify(Engine.get_license_info(), "\t") + "\n")
	file.close()
	quit()
