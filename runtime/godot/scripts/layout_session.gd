extends Node

var busy := false
var _current: Dictionary = {}
var _dirty := false
var _sequence := 0
var _worker: Thread
var _directory := ""

func current() -> Dictionary:
	return _current

func is_dirty() -> bool:
	return _dirty

func clear() -> void:
	_current = {}
	_dirty = false
	_remove_directory(_directory)
	_directory = ""

# Open/edit results are candidates until the composition root accepts them.
func open_project(path: String) -> Dictionary:
	return await _execute(path, {})

func open_plan_project(path: String) -> Dictionary:
	return await _execute(path, {}, false, "edit-plan")

func apply_plan_command(command: Dictionary) -> Dictionary:
	if _current.is_empty():return {"ok":false,"error":"Open a Project for correction first."}
	return await _execute(_current["projectPath"], command, false, "edit-plan-command")

func apply_command(command: Dictionary) -> Dictionary:
	if _current.is_empty():
		return { "ok": false, "error": "Open an editable Project first." }
	return await _execute(_current["projectPath"], command)

func preview(command:Dictionary) -> Dictionary:
	if _current.is_empty():return {"ok":false,"error":"Open an editable Project first."}
	return await _execute(_current["projectPath"],command,true)

func accept(candidate: Dictionary, opened := false) -> void:
	var previous := _current
	_current = candidate
	_dirty = not opened
	if not previous.is_empty():
		discard_candidate(previous)

func discard_candidate(candidate: Dictionary) -> void:
	_remove_directory(str(candidate["projectPath"]).get_base_dir())

func save_project(path: String) -> Error:
	var error := _copy_atomic(_current["projectPath"], path)
	if error == OK:
		_dirty = false
	return error

func export_runtime(path: String) -> Error:
	return _copy_atomic(_current["packagePath"], path)

func _copy_atomic(source: String, destination: String) -> Error:
	var temporary := destination + ".p2w-%s-%s.tmp" % [OS.get_process_id(), Time.get_ticks_usec()]
	var error := DirAccess.copy_absolute(source, temporary)
	if error == OK:
		error = DirAccess.rename_absolute(temporary, destination)
	if error != OK:
		DirAccess.remove_absolute(temporary)
	return error

func _execute(project_path: String, command: Dictionary, preview_only:=false, operation:="") -> Dictionary:
	if busy:
		return { "ok": false, "error": "An edit is still being applied." }
	var core_dir := OS.get_environment("P2W_AUTHORING_CORE") if OS.has_environment("P2W_AUTHORING_CORE") else OS.get_executable_path().get_base_dir().path_join("core")
	var executable := core_dir.path_join("node.exe" if OS.get_name() == "Windows" else "node")
	var script := core_dir.path_join("layout-core.cjs")
	if not FileAccess.file_exists(executable) or not FileAccess.file_exists(script):
		return { "ok": false, "error": "This player build does not include furniture editing." }
	if _directory.is_empty():
		_directory = ProjectSettings.globalize_path("user://layout-sessions/%s-%s" % [OS.get_process_id(), Time.get_ticks_usec()])
		DirAccess.make_dir_recursive_absolute(_directory)
	_sequence += 1
	var stem := _directory.path_join(str(_sequence))
	var request_path := stem + ".request.json"
	var response_path := stem + ".response.json"
	var file := FileAccess.open(request_path, FileAccess.WRITE)
	if file == null:
		return { "ok": false, "error": "Could not create the local editing session." }
	file.store_string(JSON.stringify({ "op": operation if not operation.is_empty() else ("preview" if preview_only else ("open" if command.is_empty() else "command")), "projectPath": project_path, "command": command, "outputDirectory": stem }))
	file.close()
	busy = true
	_worker = Thread.new()
	_worker.start(func():
		var output: Array = []
		return OS.execute(executable, PackedStringArray([script, request_path, response_path]), output, true, false))
	while _worker.is_alive():
		await get_tree().process_frame
	var exit_code: int = _worker.wait_to_finish()
	_worker = null
	busy = false
	DirAccess.remove_absolute(request_path)
	if not FileAccess.file_exists(response_path):
		_remove_directory(stem)
		return { "ok": false, "error": "Furniture editing could not finish (exit %d)." % exit_code }
	var response = JSON.parse_string(FileAccess.get_file_as_string(response_path))
	DirAccess.remove_absolute(response_path)
	if typeof(response) != TYPE_DICTIONARY:
		_remove_directory(stem)
		return { "ok": false, "error": "The editing result could not be read." }
	if not response.get("ok", false):
		_remove_directory(stem)
	return response

func _remove_directory(path: String) -> void:
	if path.is_empty():
		return
	var directory := DirAccess.open(path)
	if directory == null:
		return
	for file in directory.get_files():
		directory.remove(file)
	for child in directory.get_directories():
		_remove_directory(path.path_join(child))
	DirAccess.remove_absolute(path)

func _exit_tree() -> void:
	if _worker != null:
		_worker.wait_to_finish()
	_remove_directory(_directory)
