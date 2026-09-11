#!/bin/zsh
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
installed_config="$HOME/Library/Application Support/Pixel Flow Team Gateway/config.json"
if [[ -f "$installed_config" ]]; then
  export PIXEL_FLOW_TEAM_CONFIG="$installed_config"
fi
exec node "$script_dir/cli.mjs" "$@"
