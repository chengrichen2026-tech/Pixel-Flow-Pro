#!/bin/zsh
set -euo pipefail
service_label="com.pixel-flow.miaoda-worker"
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
source_config="$project_dir/runtime/miaoda-worker/config.json"
install_dir="$HOME/Library/Application Support/Pixel Flow Miaoda Worker"
runtime_dir="$install_dir/runtime"
service_plist="$install_dir/$service_label.plist"
node_bin="$(command -v node)"
python_bin="$(command -v python3)"
image_script="$HOME/.codex/skills/codex-gpt-image/scripts/codex_gpt_image.py"
user_domain="gui/$(id -u)"
if [[ ! -f "$source_config" ]]; then
  echo "缺少 $source_config；请先创建 Mac Worker 凭证"
  exit 1
fi
mkdir -p "$install_dir" "$runtime_dir"
cp "$script_dir/worker.mjs" "$install_dir/worker.mjs"
cp "$script_dir/core.mjs" "$install_dir/core.mjs"
cp "$source_config" "$install_dir/config.json"
chmod 600 "$install_dir/config.json"
cat > "$service_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$service_label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_bin</string>
    <string>$install_dir/worker.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PIXEL_FLOW_MIAODA_RUNTIME_DIR</key><string>$runtime_dir</string>
    <key>PIXEL_FLOW_MIAODA_CONFIG</key><string>$install_dir/config.json</string>
    <key>PIXEL_FLOW_MIAODA_PYTHON</key><string>$python_bin</string>
    <key>PIXEL_FLOW_CODEX_IMAGE_SCRIPT</key><string>$image_script</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$runtime_dir/worker.log</string>
  <key>StandardErrorPath</key><string>$runtime_dir/worker.error.log</string>
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
sleep 2
launchctl print "$user_domain/$service_label" | grep -E 'state =|pid ='
