# Renderer lighting reference

`lighting_profile.gd` owns one exposure/white-point/fixture scale and four session
natural-light presets. Native fixture lumens/temperature and GLB reflectance are
unchanged. Plan view retains exposure 1, unlit materials and disabled light sources;
returning restores the chosen perspective preset. Full and incremental updates
use the same fixture-light constructor.

The walkthrough reference uses exposure 0.85, white point 6, 800lm per renderer
energy unit, and ambient/sun pairs Day 0.30/0.85, Night 0.025/0.02, Sunrise
0.14/0.55, Sunset 0.12/0.45. A shared procedural sky supplies the reflection
reference for metallic materials while the visible background remains separate.
This is renderer calibration, not location/date-based sun simulation.

The fixed authored 6×6m reference has a large window, an explicitly attached
800lm ceiling light, generic wall art/mirror, and one retained semantic marker.
Its input/camera are identical in the before/after check. The central scene ROI
samples every third pixel, excluding native HUD regions; near-white means all
RGB channels at least 0.98. Day clipping was 83.59% before, 0% after; final average
RGB was 0.810/0.329/0.490/0.446 across Day/Night/Sunrise/Sunset. All four final
views were actually rendered with Godot 4.7.2 Compatibility/Mesa; raw images and
measurements remain in the ignored development run. The displayed gate requires
less than 1% clipping and a visible day/night difference in this fixed workload.

The normal native light-controls gate separately checks on/off, 2700K/6500K floor
illumination, source movement, mode restoration and saved settings. This does not
certify YJ215, other arbitrary materials, Windows Forward+ or physical hardware.
The private YJ215 Project is still absent in this checkout.
