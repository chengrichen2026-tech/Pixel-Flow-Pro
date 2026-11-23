#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
runtime_dir="$project_dir/runtime"
server_path="$script_dir/server.mjs"
pid_path="$runtime_dir/api-worker.macos.pid"
stdout_path="$runtime_dir/api-worker.macos.log"
stderr_path="$runtime_dir/api-worker.macos.error.log"
health_url="http://127.0.0.1:43129/health"

case "$(uname -m)" in
  arm64)
    bundled_node="$script_dir/node-runtime/macos-arm64/node"
    ;;
  x86_64)
    bundled_node="$script_dir/node-runtime/macos-x64/node"
    ;;
  *)
    echo "Unsupported Mac architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if [[ -x "$bundled_node" ]]; then
  node_bin="$bundled_node"
elif command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
else
  echo "Node.js was not found. Use the Mac partner package with api-worker/node-runtime, or install Node.js 20 or newer." >&2
  exit 1
fi

mkdir -p "$runtime_dir"

if health="$(curl --fail --silent --show-error --max-time 2 "$health_url" 2>/dev/null)" \
  && [[ "$health" == *'"ok":true'* ]] \
  && [[ "$health" == *'"workerVersion":2'* ]] \
  && [[ "$health" == *'"gpt-image-2.5-sunburst"'* ]] \
  && [[ "$health" == *'"gpt-image-2.5-flare"'* ]]; then
  echo "Pixel Flow API Worker is already running with current model support."
  exit 0
fi

nohup "$node_bin" "$server_path" >>"$stdout_path" 2>>"$stderr_path" </dev/null &
worker_pid=$!
echo "$worker_pid" > "$pid_path"

for attempt in {1..15}; do
  sleep 1
  if health="$(curl --fail --silent --show-error --max-time 2 "$health_url" 2>/dev/null)" \
    && [[ "$health" == *'"ok":true'* ]]; then
    echo "Pixel Flow API Worker is running on 127.0.0.1:43129 (PID $worker_pid)."
    exit 0
  fi
  if ! kill -0 "$worker_pid" 2>/dev/null; then
    echo "Pixel Flow API Worker exited during startup. See $stderr_path" >&2
    exit 1
  fi
done

kill "$worker_pid" 2>/dev/null || true
echo "Pixel Flow API Worker did not pass its health check. See $stderr_path" >&2
exit 1
