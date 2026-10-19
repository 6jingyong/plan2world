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
- [ ] Freeze the complete emitted JSON before inspecting downstream output.
- [ ] Record source-image review separately from schema/geometry validity.
- [ ] Do not hand-edit a failed JSON or generated native/3D model to make a candidate pass.
- [ ] If a failure is found, identify the earliest incorrect artifact and verify the reusable fix with a separate fresh reconstruction when the Skill changed.

## User workflows

- [ ] Verify affected import → Review → native edit → save/reload behavior.
- [ ] For 3D changes, verify the 1.20 m cut and ordinary 3D view on unchanged native geometry.
- [ ] For walkthrough changes, verify entry, movement, doorway traversal/collision and exit/re-entry without modifying the candidate geometry.
- [ ] Verify affected Undo/Redo and package round trips where applicable. Use `docs/project-package-v1.md` for the package contract.
- [ ] Record browser/device/input checks and explicitly list untested environments. Managed browser CI is not physical-device qualification.
- [ ] For performance changes, record the workload, hardware and measurement method; viewport emulation is not a device benchmark.

## Deployment evidence

- [ ] Record the deployment procedure, previously working revision and recovery plan before publishing.
- [ ] Verify the served commit/version after publishing.
- [ ] Re-run the affected user workflow against the deployed build.
- [ ] Record any remaining limits or skipped environments rather than converting them into implied release guarantees.