# Hard floor-plan blind benchmark

These fixtures capture first-pass GPT-5.6 Sol reconstructions of four web-found floor-plan images supplied by the project owner after the initial Wikimedia A/B benchmark had already been defined. They are therefore stronger blind-quality samples than the original A/B pair.

The source rasters are **not redistributed in this repository** because their reuse licenses are unknown. Only the resulting `plan2world-draft-v1` JSON is kept.

All four reconstructions follow the same product contract: one floor, centimetres, architecture only, no furniture, conservative scale labeling, straight centerline walls, and source-registration anchors where the raster supports them. Geometry-health findings are intentionally preserved rather than silently hand-corrected.

## Sample 1 — decorated YJ215 apartment

A Chinese rendered/decorated apartment plan with furniture, floor textures, balconies, room labels, heavy structural strokes and full dimension chains. The visible horizontal chain totals about 22.10 m and the side chains about 13.3–13.4 m, so scale is `measured` with high confidence.

This sample is primarily a semantic-separation test: decorative objects and cabinetry must not become walls. The first-pass reconstruction intentionally retains one `opening-outside-wall` finding where an estimated window is wider than its short host segment.

## Sample 2 — One Hyde Park B.07.1

A very large five-bedroom full-floor luxury apartment with angled exterior façades, many service/dressing/bath partitions and extensive furniture annotation. The sheet states 9,307 sq ft / 864.7 m² gross internal area and `1:150 @ A3`.

The raster does not preserve trustworthy physical page size/DPI, so the printed ratio is **not** treated as a measured raster scale. The reconstruction uses `estimated` scale based on stated floor area plus extracted footprint proportions. The goal is main circulation/topology, not every cabinetry line.

## Sample 3 — curved Lianjia apartment

A Chinese apartment plan with perimeter dimension chains and a dominant curved exterior living-room/balcony façade. Scale is `measured`, but `plan2world-draft-v1` currently supports straight wall centerlines only. The curved façade is therefore polygonized into multiple straight segments. This sample separates model-recognition error from a real schema/runtime representation limit.

## Sample 4 — black hidden-door plan

A sparse black-background plan labeled with chairman/secretary rooms, hidden doors, a sliding door, bathrooms and a fire-escape corridor. It contains no printed metric dimensions. Scale is `estimated` from repeated conventional entry-door symbols. The circular waterbed, chair, wardrobes and sanitary fixtures are deliberately ignored as furniture/fixtures rather than converted into architecture.
