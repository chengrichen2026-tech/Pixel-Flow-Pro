#!/bin/zsh
set -euo pipefail
service_label="com.pixel-flow.miaoda-worker"
install_dir="$HOME/Library/Application Support/Pixel Flow Miaoda Worker"
user_domain="gui/$(id -u)"
launchctl bootout "$user_domain/$service_label" 2>/dev/null || true
echo "已停止 Mac Worker；配置和日志仍保留在 $install_dir"
