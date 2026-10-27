# Optional source recovery

Reconstruction refusals often come from redundant or inconsistent records of an
observed feature. The strict parser/preflight still rejects those records. The
optional recovery layer preserves the failed original and makes an audited program
projection before running the same checks again. It does not certify source fidelity.

| Failure | Deterministic handling | What remains a source decision |
| --- | --- | --- |
| Repeated/shared wall stroke | Union exact collinear overlapping coverage; exact reversed quadratic duplicates also reuse one path | Close parallel walls and differently shaped curves stay separate |
| Zero-area outline excursion | Cancel straight wall-edge retracing or duplicate points only when signed area, seed and a simple outline are preserved | Noncollinear crossings, changed edge types and genuine corner alternatives need local review |
| Sliding wire alias | `kind: slidingDoor` becomes `kind: door` only when the existing `doorType` is already `sliding` | Unknown or contradictory types are not guessed |
| Missing accepted door host | Derive the observed aperture gap only between unique, exactly collinear opposing wall ends at the two jambs | Missing/misaligned flanks, crossing walls or disputed jambs need confirmation |

The algorithms do not move source coordinates, bridge unobserved gaps, fit centrelines,
change snapping, alter scale/furniture or add construction from room labels.
Cancelled/merged observations and their evidence remain in the original record and
audit. Ordinary strict entry points keep their existing behavior.

## Shared reconstruction API

`reconstructFloorPlanWithObserver(observe, source, options, recoveryOptions)` and
the browser wrapper's `options.recovery` enable this layer explicitly.
An empty recovery object enables deterministic handling without another model
request. A supplied `review(request)` callback authorizes at most one local review
for the whole execution. No provider transport is built into recovery; desktop
callers with two paid observations remain unchanged.

Use `buildSourceRecoveryInstructions(request)` with a separately authorized model
reviewer, or provide a human answer. The packet contains the source identity,
original-pixel focus/context, bounded source records and a pinned request ID.
After-furnishing requests also bind the failed stage. Choices are:

- Confirm the existing aperture endpoints, when offered. Programs add a logical
  host over exactly that aperture; this is not permission to infer flanking walls.
- Revise the listed local source records from visible evidence. Missing endpoints
  need actual source observation; no native IDs, global rewrite, removed accepted
  feature, changed kind, seed movement or out-of-region edit is accepted.
- Leave unconfirmed, including when neither interpretation is supported. Preserve
  the refusal for manual work, without another automatic request.

The new source projection must pass preflight and host checks. After furniture,
regenerate the stage with the same frozen semantic/position anchors; never patch
the previous stage or final draft. `onAudit` and `onStage` callbacks receive copies
for durable provenance. A `SourceRecoveryRequired` error carries the audit and,
where a bounded visual review is possible, the pending request. Provider failures,
invalid furniture and nonvisual caller-contract errors do not trigger image retries.

## Local Skill / CLI

From frozen original-pixel observations, use a new output directory:

```sh
NODE_ENV=production node tooling/recover-plan2world-source.mjs \
  --input source-architecture.json --source original.jpg \
  --furnishing source-furnishing.json --output NEW_DIRECTORY
```

The optional furnishing argument enables full preparation/strict assembly. Without
it, the command performs only recovery/preflight, before furnishing observation.
Inputs may use literal coordinates or the optional shared point references.

Successful runs write a separate projected architecture, audit, stage, draft and
canonical Project with the original source background. Pending runs exit 2 and
retain `observation-original.json`, failures, initial stage snapshots and, when
applicable, `review-request.json` / `review.html`. No existing directory is reused.

The local page shows overview/context, supports an unselected choice, optional
endpoint/straight-wall-outline annotation, and downloads an answer; it sends
nothing and applies no geometry. Resume against the SAME inputs into another new
directory:

```sh
NODE_ENV=production node tooling/recover-plan2world-source.mjs \
  --input source-architecture.json --source original.jpg \
  --furnishing source-furnishing.json \
  --decision source-review-decision.json --review-actor human \
  --output ANOTHER_NEW_DIRECTORY
```

Use `--review-actor model` for an explicitly obtained model answer. This flag labels
the saved answer; it never calls a provider. Stale answers, broader edits, invalid
revisions and a second review requirement remain refused. Report original status,
algorithmic changes, review count and source review separately; fault-injection
replays are program tests, not fresh recognition successes.
