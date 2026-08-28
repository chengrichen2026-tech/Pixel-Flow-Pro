#!/bin/zsh
set -euo pipefail
service_label="com.pixel-flow.api-worker"
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
runtime_dir="$project_dir/runtime"
service_plist="$runtime_dir/com.pixel-flow.api-worker.plist"
node_bin="$(command -v node)"
user_domain="gui/$(id -u)"
mkdir -p "$runtime_dir"
cat > "$service_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$service_label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_bin</string>
    <string>$script_dir/server.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$project_dir</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$runtime_dir/api-worker.log</string>
  <key>StandardErrorPath</key><string>$runtime_dir/api-worker.error.log</string>
</dict>
</plist>
PLIST
launchctl bootout "$user_domain/$service_label" 2>/dev/null || true
sleep 1
if ! launchctl bootstrap "$user_domain" "$service_plist"; then
  sleep 2
  launchctl bootstrap "$user_domain" "$service_plist"
fi
launchctl enable "$user_domain/$service_label"
launchctl kickstart -k "$user_domain/$service_label"
curl --fail --silent --show-error --retry 10 --retry-delay 1 http://127.0.0.1:43129/health
