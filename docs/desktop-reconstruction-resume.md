# Desktop reconstruction recovery and reported usage

The desktop can explicitly continue a saved reconstruction without repeating its
completed observations. A new reconstruction still makes the original two
observations. Prompts, original/working image coordinates, source recovery,
closure and deterministic assembly are unchanged. Browser generation remains
unchanged; there is no global image cache or automatic paid retry.

## Native flow

After a failed or cancelled generation, **Continue saved task** states the number
of missing requests and requires new consent for those requests. **Restore last
task** restores the most recently published checkpoint after application restart;
**Choose saved task…** opens another `checkpoint.json`. Account credentials are
never retained across restart. Connecting again keeps an explicitly restored
model, but does not authorize a request.

- No completed observations: two requests remain.
- Architecture complete: only furnishing is requested.
- Both complete: **Rebuild from saved observations · no requests** works offline,
  without an account or paid consent, including after an output-write failure.
- **Start a new task** keeps prior evidence and requires choosing/confirming an
  image again. It does not silently reuse an old task.

Input/model/scale changes disable continuation. The core independently verifies
all bindings before sending a request. Invalid or mismatched checkpoints require
an explicit new task; they never silently fall back to two paid requests.

## Checkpoints and evidence

`plan2world-desktop-checkpoint-v1` is a private authoring sidecar, not a Project or
runtime schema. Each attempt is a new directory containing copied original and
working input bytes, RGBA pixels, preparation evidence when applicable, complete
raw observations, prompt/observation hashes and stage receipts. Bindings cover the
model, instruction version, exact scale hint, dimensions, original/working image
and pixel hashes, preparation manifest and actual stage prompt hashes.

The same shared correction pipeline replays validated observations through an
observer callback. The engine does not reconstruct geometry or edit observations.
Inherited observations are fully copied before a new checkpoint is published;
interrupting a continuation cannot advertise a checkpoint that lost its cache.
Files are published atomically. Partial responses are not completed observations.
Previous attempts and frozen observations are never overwritten.

The native preference stores only the last checkpoint path. The task directory
has no credentials, request headers or provider error bodies. Started requests
whose outcome is unknown remain potentially billable. Raw model responses and
reported usage remain available even when returned JSON cannot be accepted.

## Reported usage

Each stage distinguishes started, responded, completed, failed and reused work.
Input/output/total tokens, cached-input and reasoning subsets, and cost come only
from provider reports. Missing/invalid values stay null and appear as **not
provided**. Cached/reasoning subsets are never added to the reported total.

Prompt/response text byte counts are separately labelled **not tokens**. The
saved observation's formatted JSON can be larger than the model's original
response; its file size is not the model output-token count. Images also consume
provider-specific input tokens; local byte counts cannot establish that billing.

Cost and request totals refer to the **current attempt**. Reusing a previous
observation adds no new request or cost; its original usage and failed attempts
remain in the retained receipts. Neither a zero-call replay nor absent usage
implies that earlier requests were free. Usage/checkpoint transport stays outside
canonical Project and runtime artifacts.

## Opening an incomplete Project

A valid native Project rejected by pure runtime geometry checks offers **Open
this Project for correction…** beside the error. Clicking it opens that exact
Project without picking its file again. It respects unsaved layout/correction
guards; cancelling a guard retains the target. No window opens automatically.

Unreadable/invalid files, asset IO and artifact-write failures remain operational
errors. The original error and previous world stay intact. Shared runtime compile
validation still controls **Apply to space**; the recovery action does not accept
invalid geometry. Desktop entrance selection also uses the shared authoring
command, clearing old entrances/starts consistently across floors.

Synthetic mocked-provider lifecycle tests verify request counts and real native
IPC/process restart, not external model quality, real pricing or Windows GPU/input.
