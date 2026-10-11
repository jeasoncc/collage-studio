#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == --help || $# -gt 1 ]]; then
  printf 'Usage: bash scripts/build-snap.sh [OUTPUT.snap]\nRequires Snapcraft 8+ and an initialized local LXD installation. No store login is needed.\n'
  [[ ${1:-} == --help ]] && exit 0 || exit 1
fi
command -v snapcraft >/dev/null || { printf 'Install Snapcraft: sudo snap install snapcraft --classic\n' >&2; exit 1; }
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
tar -C "$root" \
  --exclude='./.git' --exclude='./.env' --exclude='./.env.*' \
  --exclude='./node_modules' --exclude='./dist' --exclude='./dist-native' --exclude='./out' \
  --exclude='./src-tauri/target' --exclude='./src-tauri/gen' \
  --exclude='./third_party/codecs/.work' --exclude='./third_party/codecs/relink' \
  --exclude='./third_party/codecs/aac/build' --exclude='./third_party/codecs/generated/*.js' \
  --exclude='./third_party/codecs/build-receipt.json' \
  --exclude='./.snapcraft' --exclude='./parts' --exclude='./stage' --exclude='./prime' \
  --exclude='*.keystore' --exclude='*.jks' --exclude='*.p12' --exclude='*.mobileprovision' \
  --exclude='*.apk' --exclude='*.aab' --exclude='*.ipa' --exclude='*.collage' \
  --exclude='*.snap' -cf - . | tar -C "$work" -xf -
(cd "$work" && snapcraft pack --use-lxd --output "$output")
printf 'Built %s\nInstall locally: sudo snap install --dangerous %q\n' "$output" "$output"
