#!/bin/zsh
set -euo pipefail
service_label="com.pixel-flow.team-gateway"
launchctl bootout "gui/$(id -u)/$service_label" 2>/dev/null || true
rm -f "$HOME/Library/Application Support/Pixel Flow Team Gateway/$service_label.plist"
