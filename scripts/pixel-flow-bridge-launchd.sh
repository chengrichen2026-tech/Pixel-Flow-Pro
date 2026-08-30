#!/bin/zsh
set -euo pipefail
ACTION="${1:-status}"
PROJECT_DIR="${0:A:h:h}"
LABEL="com.pixel-flow.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$PROJECT_DIR/.runtime"
NODE_BIN="$(command -v node)"
case "$ACTION" in
  install)
    mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
    sed -e "s|__NODE__|$NODE_BIN|g" -e "s|__DAEMON__|$PROJECT_DIR/tools/pixel-flow-bridge/daemon.mjs|g" -e "s|__LOG_DIR__|$LOG_DIR|g" "$PROJECT_DIR/tools/pixel-flow-bridge/com.pixel-flow.bridge.plist.template" > "$PLIST"
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST"
    launchctl kickstart -k "gui/$UID/$LABEL"
    ;;
  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    [ ! -f "$PLIST" ] || mv "$PLIST" "$HOME/.Trash/$LABEL.plist-$(date +%Y%m%d-%H%M%S)"
    ;;
  status) launchctl print "gui/$UID/$LABEL" ;;
  *) echo "Usage: $0 {install|status|uninstall}" >&2; exit 2 ;;
esac
