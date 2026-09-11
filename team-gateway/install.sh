#!/bin/zsh
set -euo pipefail
service_label="com.pixel-flow.team-gateway"
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
source_runtime_dir="$project_dir/runtime/team-gateway"
install_dir="$HOME/Library/Application Support/Pixel Flow Team Gateway"
runtime_dir="$install_dir/runtime"
service_plist="$install_dir/$service_label.plist"
node_bin="$(command -v node)"
python_bin="$(command -v python3)"
image_script="$HOME/.codex/skills/codex-gpt-image/scripts/codex_gpt_image.py"
user_domain="gui/$(id -u)"
mkdir -p "$source_runtime_dir" "$runtime_dir"
if [[ ! -f "$source_runtime_dir/config.json" ]]; then
  "$node_bin" "$script_dir/cli.mjs" init
fi
cp "$script_dir/server.mjs" "$install_dir/server.mjs"
cp "$script_dir/core.mjs" "$install_dir/core.mjs"
if [[ ! -f "$install_dir/config.json" ]]; then
  cp "$source_runtime_dir/config.json" "$install_dir/config.json"
fi
cat > "$service_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$service_label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_bin</string>
    <string>$install_dir/server.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PIXEL_FLOW_TEAM_RUNTIME_DIR</key><string>$runtime_dir</string>
    <key>PIXEL_FLOW_TEAM_CONFIG</key><string>$install_dir/config.json</string>
    <key>PIXEL_FLOW_TEAM_PYTHON</key><string>$python_bin</string>
    <key>PIXEL_FLOW_CODEX_IMAGE_SCRIPT</key><string>$image_script</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$runtime_dir/team-gateway.log</string>
  <key>StandardErrorPath</key><string>$runtime_dir/team-gateway.error.log</string>
</dict>
</plist>
PLIST
launchctl bootout "$user_domain/$service_label" 2>/dev/null || true
if ! launchctl bootstrap "$user_domain" "$service_plist"; then
  sleep 2
  launchctl bootstrap "$user_domain" "$service_plist"
fi
launchctl enable "$user_domain/$service_label"
launchctl kickstart -k "$user_domain/$service_label"
curl --noproxy 127.0.0.1 --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:43130/health
