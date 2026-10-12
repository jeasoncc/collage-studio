#!/usr/bin/env bash
set -euo pipefail

provider=--use-lxd
if [[ ${1:-} == --destructive-mode ]]; then
  provider=--destructive-mode
  shift
fi
if [[ ${1:-} == --help || $# -gt 1 ]]; then
  printf 'Usage: bash scripts/build-snap.sh [--destructive-mode] [OUTPUT.snap]\nRequires Snapcraft 8+ and initialized local LXD by default. --destructive-mode is only for a disposable Ubuntu 24.04 build environment. No Store login is needed.\n'
  [[ ${1:-} == --help ]] && exit 0 || exit 1
fi
command -v snapcraft >/dev/null || { printf 'Install Snapcraft 8+ in the build environment (sudo snap install snapcraft --classic).\n' >&2; exit 1; }
if [[ "$provider" == --destructive-mode ]]; then
  . /etc/os-release
  [[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { printf 'The core24 destructive build requires disposable Ubuntu 24.04; refusing this host.\n' >&2; exit 1; }
fi
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
case "$(uname -m)" in
  x86_64) architecture=amd64 ;;
  aarch64) architecture=arm64 ;;
  *) printf 'Snap supports native amd64 and arm64 builds only.\n' >&2; exit 1 ;;
esac
output=$(realpath -m -- "${1:-$root/out/snap/collage-studio_1.0.0_$architecture.snap}")
mkdir -p -- "$(dirname -- "$output")"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

# Build a clean copy: never stage local secrets, web output, caches or a backend.
tar --exclude-vcs-ignores -C "$root" \
  --exclude='.git' --exclude='.env' --exclude='.env.*' \
  --exclude='./.smoke' --exclude='./node_modules' --exclude='./dist' --exclude='./dist-native' --exclude='./out' \
  --exclude='./src-tauri/target' --exclude='./src-tauri/gen/schemas' --exclude='./src-tauri/gen/apple' \
  --exclude='./src-tauri/gen/android/.gradle' --exclude='./src-tauri/gen/android/.tauri' \
  --exclude='./src-tauri/gen/android/build' --exclude='./src-tauri/gen/android/app/build' \
  --exclude='./src-tauri/gen/android/app/.cxx' --exclude='./src-tauri/gen/android/local.properties' \
  --exclude='./src-tauri/plugins/native-save/android/.tauri' --exclude='./src-tauri/plugins/native-save/android/build' \
  --exclude='./third_party/codecs/.work' --exclude='./third_party/codecs/relink' \
  --exclude='./third_party/codecs/aac/build' --exclude='./third_party/codecs/generated/*.js' \
  --exclude='./third_party/codecs/build-receipt.json' \
  --exclude='./snap/local' --exclude='./.snapcraft' --exclude='./parts' --exclude='./stage' --exclude='./prime' \
  --exclude='./packaging/aur/collage-studio' \
  --exclude='*.keystore' --exclude='*.jks' --exclude='*.p12' --exclude='*.mobileprovision' \
  --exclude='*.apk' --exclude='*.aab' --exclude='*.ipa' --exclude='*.collage' \
  --exclude='*.snap' -cf - . | tar -C "$work" -xf -
mkdir -p "$work/snap/local"
tar -C "$work" --exclude='./snap/local' --transform='s,^\./,collage-studio-1.0.0/,' \
  -czf "$work/snap/local/collage-studio-1.0.0.tar.gz" .
# Snapcraft 9 requires the initial packed file to stay inside the project tree.
packed="$work/collage-studio_1.0.0_$architecture.snap"
(cd "$work" && snapcraft pack "$provider" --build-for "$architecture" --output "$packed")
install -m644 -- "$packed" "$output"
sha256sum "$output"
printf 'Built %s\nInstall on a strict-confinement Snap host: sudo snap install --dangerous %q\n' "$output" "$output"
