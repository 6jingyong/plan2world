# Real floor-plan fixtures

This directory separates deterministic downstream fixtures from fresh reconstruction evaluation.

## Deterministic downstream baseline

`wikimedia-two-bedroom-source.jpg` is an unchanged 535 × 526 JPEG from Wikimedia Commons: “Proposed two bedroom” by Bajoga2021, CC BY-SA 4.0. Its SHA-256 is `14e965e54b8d2e9788c967eb4eed8b6dde46866717167f3698c51941aa51a5e1`.

`wikimedia-two-bedroom.json` is a hand-authored `plan2world-draft-v1` used to test parsing, geometry health, room derivation, native conversion and product correction flows. It is not a vision benchmark answer and must not be used to seed image reconstruction.

## Fresh reconstruction corpus

`reconstruction-corpus/manifest.json` contains only source identity and challenge metadata for the five difficult owner-provided rasters. The rasters themselves are not redistributed because their reuse rights are not established.

The reconstruction manifest deliberately contains no reference path, prior draft, wall trace, annotation, candidate ID or score. A fresh run starts only from a raster whose dimensions and SHA-256 match that manifest.

## Evaluation truth

`evaluation-references/` contains source-space human references. They are post-hoc evaluation data, not reconstruction inputs. Do not inspect or load them until the run's wall evidence, Bare House, source annotations, assembled draft and source overlay have been generated and frozen.

Historical model outputs are not stored in the active tree. Git history is the archaeology layer if an old run ever needs to be inspected.

## Generated run artifacts

Generated reconstruction artifacts must never be written under `tests/fixtures`.

Every rerun gets a new ignored directory:

`.plan2world-validation/runs/<run-id>/<sample-id>/`

A run may contain `wall-trace.json`, `bare-house.json`, `source-annotation.json`, `draft.json`, review overlays and an evaluation report. Never reuse an existing run directory as input to a new reconstruction. `.plan2world-validation/` is git-ignored so generated outputs cannot silently become fixtures.
