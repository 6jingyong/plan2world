extends Node

var busy := false
var history: Array[Dictionary] = []
var index := -1
var _saved_revision := ""
var _sequence := 0
var _worker: Thread
var _directory := ""

func current() -> Dictionary:
	return history[index] if index >= 0 else {}

func is_dirty() -> bool:
	return not current().is_empty() and current()["projectPath"] != _saved_revision

func clear() -> void:
	history.clear()
	index = -1
	_saved_revision = ""
	_remove_directory(_directory)
	_directory = ""

func open_project(path: String) -> Dictionary:
	var result: Dictionary = await _execute(path, {})
	if result.get("ok", false):
		for revision in history:
			discard_revision(revision)
		history = [result]
		index = 0
		_saved_revision = result["projectPath"]
	return result

func apply_command(command: Dictionary) -> Dictionary:
	if current().is_empty():
		return { "ok": false, "error": "Open an editable Project first." }
	var result: Dictionary = await _execute(current()["projectPath"], command)
	return result

func commit_revision(result: Dictionary) -> void:
	for revision in history.slice(index + 1):
		discard_revision(revision)
	history.resize(index + 1)
	history.append(result)
	if history.size() > 50:
		discard_revision(history.pop_front())
	index = history.size() - 1

func discard_revision(revision: Dictionary) -> void:
	_remove_directory(str(revision["projectPath"]).get_base_dir())

func undo() -> Dictionary:
	if not busy and index > 0:
		index -= 1
	return current()

func redo() -> Dictionary:
	if not busy and index + 1 < history.size():
		index += 1
	return current()

func save_project(path: String) -> Error:
	var error := DirAccess.copy_absolute(current()["projectPath"], path)
	if error == OK:
		_saved_revision = current()["projectPath"]
	return error

func export_runtime(path: String) -> Error:
	return DirAccess.copy_absolute(current()["packagePath"], path)

func _execute(project_path: String, command: Dictionary) -> Dictionary:
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
	file.store_string(JSON.stringify({ "op": "open" if command.is_empty() else "command", "projectPath": project_path, "command": command, "outputDirectory": stem }))
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
