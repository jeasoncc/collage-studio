#!/usr/bin/env bash
set -euo pipefail

printf 'Read-only OS and memory/RSS diagnostics; ps RSS/VSZ units are KiB.\n'
date -u '+%Y-%m-%dT%H:%M:%SZ'
sw_vers
uname -a
sysctl hw.memsize hw.ncpu
# Query mode only: never create memory pressure or change GPU/security settings.
for ((snapshot = 0; snapshot < 360; snapshot++)); do
  printf '\nSnapshot %s ' "$snapshot"
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  vm_stat
  memory_pressure -Q
  # Executable names, not arguments/environment: credentials are not exposed.
  ps -axo pid,ppid,rss,vsz,%mem,%cpu,comm
  sleep 5
done
