#!/bin/zsh
set -euo pipefail
launchctl bootout "gui/$(id -u)/com.pixel-flow.api-worker" 2>/dev/null || true
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
rm -f "$project_dir/runtime/com.pixel-flow.api-worker.plist"
