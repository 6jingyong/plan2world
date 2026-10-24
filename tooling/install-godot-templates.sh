#!/usr/bin/env bash
set -euo pipefail

# Only desktop release templates are needed. Verify the entire official archive
# before extracting; this is also the installer used by the delivery CI gate.
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
curl --fail --location --retry 3 --output "$archive" \
  https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz
echo "ca4d71c4d7b81dfc15d1a98baa07534aa95b03fdda78a0075b06672e1648d2e5f40980c9adc28d23e1b92e732ee7bf3461997aa804af74ec2fcd7a93ccb84079  $archive" | sha512sum --check --strict
destination="${XDG_DATA_HOME:-$HOME/.local/share}/godot/export_templates/4.7.2.stable"
mkdir -p "$destination"
unzip -jo "$archive" templates/linux_release.x86_64 templates/windows_release_x86_64.exe templates/version.txt -d "$destination"
