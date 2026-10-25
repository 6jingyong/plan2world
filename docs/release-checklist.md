# Release evidence checklist

Use this checklist for a specific release candidate. Checking a box requires evidence from that candidate; this document does not certify the current branch or authorize deployment.

## Candidate and automated checks

- [ ] Record the candidate commit, target environment and intended release scope.
- [ ] Confirm the final CI result for that commit, including unit/type/build checks, browser jobs and benchmark assertions. Use `.github/workflows/ci.yml` as the current source of truth.
- [ ] Review dependency-audit results and any skips/failures; record their impact.
- [ ] Review the final diff and any schema, storage or package compatibility changes.
- [ ] Update `README.md`, `AGENTS.md` or `FEATURES.md` only when the current contract, invariants or capability/limit statements changed.

## Reconstruction release evidence

When reconstruction behavior or the Skill changes:

- [ ] Apply the current `skills/reconstruct-plan2world` procedure to at least one fresh original raster.
- [ ] Create/identify a validation run and record source identity, repository commit and a new draft-candidate ID.
- [ ] Freeze the complete emitted JSON before inspecting downstream output; record its hash when practical.
- [ ] Review source → draft separately from draft-contract validity.
- [ ] Validate the frozen draft before testing validated draft → native conversion.
- [ ] Inspect native geometry before judging 2D/cut/3D, then export runtime artifacts and inspect Godot walkthrough and interaction/persistence in order.
- [ ] Do not hand-edit a failed JSON or generated native/3D model to make a candidate pass.
- [ ] Stop at the earliest failed boundary. Fix that reusable layer and leave later stages unclaimed for that run.
- [ ] If the reconstruction Skill changed, generate a separate fresh draft candidate rather than overwriting the failed one.

The ordered stage IDs and manifest semantics live in `src/lib/plan2world/validationRun.ts`; source/model/prompt identity lives in `reconstructionExperiment.ts`.

## User workflows

- [ ] Verify affected import → Review → native edit → save/reload behavior.
- [ ] For 3D changes, verify the 1.20 m cut and ordinary 3D view on unchanged native geometry.
- [ ] For runtime changes, run native export → pinned Godot asset and grounded-walkthrough gates; verify spawn, physical collision, door interaction and vertical traversal without modifying generated artifacts.
- [ ] For browser review changes, verify orbit, cut/stack, 3D element editing, phone inspector layout, camera preview and idle/resource disposal. The browser has no FPS runtime.
- [ ] For internal browser authoring, verify affected Undo/Redo and package round trips. Use `docs/project-package-v1.md` for the package contract.
- [ ] For delivered Godot layout, verify there is no Undo/Redo/history, rejected edits retain current data, and native save/export/reopen preserves accepted furniture poses and door clearance.
- [ ] Check the actual snapping scope in [native Godot layout](godot-furniture-layout.md); plane constraints, collision rejection and small keyboard steps do not establish automatic snapping.
- [ ] Record browser/device/input checks and explicitly list untested environments. Managed browser CI is not physical-device qualification.
- [ ] For performance changes, record the workload, hardware and measurement method; viewport emulation is not a device benchmark.

## Deployment evidence

- [ ] Record the deployment procedure, previously working revision and recovery plan before publishing.
- [ ] Verify the served commit/version after publishing.
- [ ] Re-run the affected user workflow against the deployed build.
- [ ] Record any remaining limits or skipped environments rather than converting them into implied release guarantees.
