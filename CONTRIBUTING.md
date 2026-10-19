# Contributing

Start with [README.md](README.md), the [agent guide](AGENTS.md) and the current [capability reference](FEATURES.md). Reconstruction work must also follow `skills/reconstruct-plan2world/SKILL.md` and the `plan2world-draft-v1` contract.

## Local setup

Use Node.js 24, as specified in [.nvmrc](.nvmrc), and npm:

```sh
npm ci
npm run dev
```

The local editor does not require Firebase credentials or an account. Keep secrets, private scans and generated build/test artifacts out of commits. Prefer synthetic plans and images for redistributable tests; remove personal information from screenshots and logs before sharing them.

## Reproduce and fix a problem

Describe the trigger, expected result and observed result. Include the commit or release, browser/OS, viewport and input method when relevant.

For ordinary geometry/data behavior, reduce the problem to a small fixture or a short sequence from a new project. Use helpers such as [roomProject](tests/fixtures/project.ts) and the existing tests in `tests/`. For editor interactions, add a focused Playwright regression in `tests/browser/` and cover save/reload, Undo/Redo or exported values when those are part of the failure.

For reconstruction failures, preserve the source and the failed artifact instead of repairing the candidate by hand:

1. generate a fresh draft from the original raster and current Skill;
2. freeze the complete emitted JSON;
3. identify the earliest incorrect stage;
4. fix the reusable Skill/converter/viewer/walkthrough layer responsible;
5. create a separate fresh reconstruction when the Skill changes.

Do not edit a failed JSON or generated native/3D model merely to obtain a passing screenshot. See [AGENTS.md](AGENTS.md) for the responsibility boundaries.

For package changes, read the [v1 contract](docs/project-package-v1.md). Preserve unsupported fields and attachments through round trips unless the format explicitly requires otherwise. For performance changes, record workload, hardware, measurement method and before/after result; a phone viewport is not a physical-phone benchmark.

## Validation

Run focused tests while developing, for example:

```sh
npm test -- tests/rooms.test.ts
npm run check
npm run build
npx playwright install chromium
npx playwright test tests/browser/walkthrough.spec.ts --project=chromium
```

The normal Playwright configuration uses the production `build/`, starts `node build/index.js` itself on port 4188 and disables analytics/cloud uploads. Rebuild after code changes before browser tests; do not start a second server on that port. Engine names are `chromium`, `firefox` and `webkit`. See [playwright.config.ts](playwright.config.ts) for current settings.

Before review, report the checks appropriate to the change and any failures, skips or untested environments. CI runs the broader unit/type/build, browser and benchmark checks in [ci.yml](.github/workflows/ci.yml); do not treat a focused local pass as that full result. Passing managed-browser CI also does not prove every host-installed browser or physical device is healthy.

## Pull requests

Explain the concrete problem and resulting behavior. Include a small before/after example or fixture, validation results, and any compatibility/data-preservation implications. Use the [PR template](.github/pull_request_template.md). Keep unrelated refactors out of the change.

Update README/AGENTS/FEATURES only when the current product contract, invariants or capability/limit statements actually change. Historical implementation diaries belong in Git history rather than being maintained as a parallel source of truth.

Maintainers should use the [release checklist](docs/release-checklist.md) for release evidence and the existing deployment/cost gates.