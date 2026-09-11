#!/bin/zsh
set -euo pipefail
service_label="com.pixel-flow.miaoda-worker"
install_dir="$HOME/Library/Application Support/Pixel Flow Miaoda Worker"
service_plist="$HOME/Library/LaunchAgents/$service_label.plist"
user_domain="gui/$(id -u)"
launchctl bootout "$user_domain/$service_label" 2>/dev/null || true
echo "已停止 Mac Worker；配置、plist 和日志仍保留在 $install_dir 与 $service_plist"
