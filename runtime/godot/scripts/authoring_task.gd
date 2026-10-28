extends Node

signal progress(message: String)
signal authorization_requested(url: String)
signal checkpoint_ready(path:String)
signal usage_reported(summary:Dictionary)
var busy := false
var _process_id := -1
var _worker: Thread
var _pipe: FileAccess
var _cancelled := false
var _cancel_message := ""
var _checkpoint_path:=""
var _usage:Dictionary={}

# Private stdio avoids keys in argv, temporary requests, Project, exports or
# engine logs. This optional authoring process is separate from offline runtime.
func run(request: Dictionary) -> Dictionary:
	if busy: return {"ok":false,"error":"An AI task is already running."}
	var core := OS.get_environment("P2W_AUTHORING_CORE") if OS.has_environment("P2W_AUTHORING_CORE") else OS.get_executable_path().get_base_dir().path_join("core")
	var program := core.path_join("node.exe" if OS.get_name()=="Windows" else "node")
	var script := core.path_join("ai-core.cjs")
	if not FileAccess.file_exists(program) or not FileAccess.file_exists(script):
		return {"ok":false,"error":"This player does not include the optional AI authoring core."}
	var process := OS.execute_with_pipe(program,PackedStringArray([script]),true)
	if process.is_empty(): return {"ok":false,"error":"Could not start the AI authoring process."}
	busy=true; _cancelled=false; _checkpoint_path="";_usage={};_process_id=process["pid"]; _pipe=process["stdio"]
	_pipe.store_line(JSON.stringify(request)); _pipe.flush()
	_worker=Thread.new()
	_worker.start(func():
		while _pipe.get_error()==OK:
			var line := _pipe.get_line()
			if line.is_empty(): continue
			var event = JSON.parse_string(line)
			if not event is Dictionary: return {"ok":false,"error":"Could not read the AI task result."}
			if event.get("done",false): return event["result"]
			if event.has("phase"): progress.emit.call_deferred(str(event["phase"]))
			if event.has("authorize"): authorization_requested.emit.call_deferred(str(event["authorize"]))
			if event.get("checkpoint") is String:_checkpoint_path=event["checkpoint"];checkpoint_ready.emit.call_deferred(_checkpoint_path)
			if event.get("usage") is Dictionary:_usage=event["usage"];usage_reported.emit.call_deferred(_usage)
		return {"ok":false,"error":"The AI task ended before completing. It was not retried."})
	while _worker.is_alive(): await get_tree().process_frame
	var result: Dictionary=_worker.wait_to_finish(); _worker=null
	_pipe.close(); _pipe=null; _process_id=-1; busy=false
	if _cancelled:result={"ok":false,"error":_cancel_message}
	if not _checkpoint_path.is_empty() and not result.has("checkpointPath"):result["checkpointPath"]=_checkpoint_path
	if not _usage.is_empty() and not result.has("usage"):result["usage"]=_usage
	return result

func cancel(message:="Task cancelled. Requests already started may still be charged.") -> void:
	if _process_id!=-1:
		_cancelled=true
		_cancel_message=message
		OS.kill(_process_id)

func _exit_tree() -> void:
	cancel()
	if _worker!=null: _worker.wait_to_finish()
	if _pipe!=null: _pipe.close()
