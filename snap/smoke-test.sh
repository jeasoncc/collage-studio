#!/usr/bin/env bash
set -euo pipefail

# Run only on a disposable, fully confined Snap host, after installing this Snap.
# Never relax AppArmor, WebKit sandboxing or host security to make this pass.
test "$(snap debug confinement)" = strict
output=$(realpath -m -- "${1:-out/snap/evidence}")
mkdir -p "$output"
snap version > "$output/snap-version.txt"
snap connections collage-studio > "$output/connections.txt"
printf 'GDK_BACKEND=%s\nWEBKIT_DISABLE_DMABUF_RENDERER=%s\n' "${GDK_BACKEND:-default}" "${WEBKIT_DISABLE_DMABUF_RENDERER:-default}" > "$output/renderer-environment.txt"
# On cgroup v2 snap run creates a scope through the real user systemd bus.
# A dbus-run-session private bus cannot reach that manager and is not a valid
# desktop login session, even when the kernel supports strict confinement.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
test -S "$XDG_RUNTIME_DIR/bus" || { echo 'A real systemd user session bus is required.' >&2; exit 1; }
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
xvfb-run -a -s '-screen 0 1280x960x24' bash -s -- "$output" <<'SMOKE'
set -euo pipefail
output=$1
# The portal is activated by the user manager, not our Xvfb child. Give it the
# real display/authentication context; otherwise GTK's portal backend times out
# before WebKit can render or open a user-selected file chooser.
export XDG_CURRENT_DESKTOP=GNOME
dbus-update-activation-environment --systemd DISPLAY XAUTHORITY XDG_CURRENT_DESKTOP
systemctl --user restart xdg-desktop-portal-gtk.service xdg-desktop-portal.service
snap run collage-studio > "$output/runtime.log" 2>&1 &
app=$!
trap 'kill "$app" 2>/dev/null || true' EXIT
for attempt in {1..75}; do
  if ! kill -0 "$app" 2>/dev/null; then
    cat "$output/runtime.log" >&2
    echo 'Sandboxed application exited before showing its window.' >&2
    exit 1
  fi
  if xdotool search --all --onlyvisible --pid "$app" --name '^拼贴时光$' > "$output/windows.txt" 2>/dev/null; then
    # Checking the actual process label prevents a merely strict metadata field
    # or a devmode/classic installation from masquerading as confinement proof.
    cat "/proc/$app/attr/current" > "$output/apparmor-label.txt"
    test "$(cat "$output/apparmor-label.txt")" = 'snap.collage-studio.collage-studio (enforce)'
    read -r window < "$output/windows.txt"
    xdotool getwindowgeometry --shell "$window" > "$output/window-geometry.txt"
    # A mapped GTK helper window or an unpainted black surface is not GUI proof.
    sleep 1
    kill -0 "$app"
    import -window "$window" "$output/strict-snap.png"
    colors=$(identify -format '%k' "$output/strict-snap.png")
    if ((colors < 32)); then
      continue
    fi
    printf 'Painted application window; AppArmor profile enforced.\n'
    exit 0
  fi
  sleep 1
done
xdotool search --pid "$app" 2>/dev/null | while read -r window; do
  xdotool getwindowname "$window"
  xdotool getwindowgeometry "$window"
done > "$output/window-diagnostics.txt" || true
cat "$output/runtime.log" >&2
echo 'No painted sandboxed application window.' >&2
exit 1
SMOKE
