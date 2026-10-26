# Runtime validation scope

The subsequent local milestone is summarized in the
[development handoff](development-handoff.md): 1,761 unit tests, complete-footprint
support, explicit multi-leaf door routes, cancellable spatial placement and the
[fixed lighting reference](runtime-lighting-calibration.md). Fifteen relocated
Linux PCK/core gate groups plus actual release boot pass; Windows is cross-built
only in this environment. The historical #81 evidence below remains separate.
The native source is `1770b87`; the later internal Review fix is `4cf5e20` and
does not change the delivered native/core sources. This local branch is unpushed.

| Current integration check | Result |
| --- | --- |
| Shared source | 1,761 tests / 203 files pass on the final code; type/build/catalog pass; audit 3 low, 0 moderate/high/critical |
| Complete browser regression | 1,332 cases on the original implementation, 444 per engine; 139 before an environment restart plus 1,193 afterward; one saved-label timeout passed unchanged on resume |
| Configured door Review | 18 Chromium/Firefox/WebKit cases pass on the subsequent production build, including 9 new actual-mesh checks for sliding, unequal paired and curved/stacked parts; rendered screenshots inspected |
| Viewer benchmark | All six desktop/phone-viewport cases pass; rename allocations and built-in GLB requests remain zero, teardown passes; software timings are informational |
| Mechanical authored case | Input, byte-stable structure/hashes/owners, five-door motion and architecture-preserving arrangement pass; sourceReview/persistence/walkthrough/rendering remain `not_run` in this report, overall `review_required` (exit 2) |
| Delivery | Fifteen relocated Linux PCK/core groups and actual release boot pass; Windows cross-build only |

Evidence is under `.plan2world-validation/runs/20261026-native-door-layout/`,
including `acceptance-status.json`, production-build hash manifests, the original
interrupted browser log/trace, resumed and targeted JSON reports, six benchmark
metrics, `mechanical-final/validation-report.json` and verified player ZIPs.
The newly expanded complete browser collection is 1,341 cases; the nine additions
were exercised in the final targeted run. Private YJ215 inputs remain absent.

## Historical #81 evidence

The native furnishing, orthographic plan and ceiling-light milestone is checked
with Godot 4.7.2. Generated inputs and output packages stay
under ignored `.plan2world-validation/`; they are not application fixtures or
public sample Projects.

| Check | Local evidence |
| --- | --- |
| Shared source | 1,738 tests in 198 files; type check, production build, catalog verification and high-threshold audit gate (0 high/critical; 3 low SvelteKit/adapter findings) |
| Internal browser | Focused Chromium/Firefox/WebKit checks for JPEG direction, desktop/phone correction, exact two-observation image transport, native save/reload and existing image/calibration flow; Chromium also checks persistent Review and early source rejection |
| Delivered runtime | Eleven relocated PCK/core gate groups plus release boot, including every-door healthy/blocked/unsupported cases and native photo preparation with mocked recognition |
| Assets/physics | Native GLB import/fit/ownership, independent colliders, dynamic doors and grounded traversal |
| Display | Actual Compatibility/Mesa window; unlit plan, layer isolation, four ceiling GLBs, downward recessed beam, real on/off/temperature illumination and four natural presets |
| Fresh YJ215 case | Two complete direct Skill executions, retained first failure, native browser save, deliberate model/mount/light edits, actual walking/rendering and byte-stable shared exports; three balcony sliders remain blocked |

The [fresh case](yj215-validation.md) separates direct Skill source review from
runtime acceptance and records unresolved extraction/parity findings. It does not
establish external-provider extraction quality. The desktop account/image gate uses a mocked provider;
no real login or paid model quality is established by it. Main-level full browser
and benchmark checks, native Windows Forward+, OS/DPI/dialog and physical
controller acceptance are separate evidence, not inferred from these checks.

Fresh real-image case reviews should record the original hash, direct Skill or
provider identity, frozen architecture/furnishing observations, deterministic
draft, source review, normally saved Project, runtime package and native editing
results. Keep source reconstruction separate from deliberately added furniture
and lights; never repair a generated artifact just to improve its screenshot.

The [input preparation](image-preparation.md) milestone uses synthetic quadrilaterals
and actual JPEG EXIF metadata, not real phone-photo recognition. A fresh YJ215
identity preparation keeps its original encoded bytes. Its new direct Skill
architecture observation was rejected for a repeated shared wall at preflight;
no furniture or downstream results are claimed for that failed run. The separate
mechanical replay of the previously saved Project exports deterministically and
reports 8 working doors / 3 blocked balcony sliders. See P4 in the
[experiment ledger](observation-experiment-results.md).

This local non-root environment loads WebKit's missing GLES library from a verified
user-local Debian package. `dlopen` was checked before running the unchanged WPE
tests; `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` bypasses only its system-cache
precheck, which ignores that library path. CI retains normal system dependency
installation and no such override. Keep the initial dependency-launch failures.

See [integration procedure](runtime-integration.md),
[fresh YJ215 case and unresolved balcony doors](yj215-validation.md),
[plan/light contract](runtime-plan-lighting.md) and
[release checklist](release-checklist.md).
