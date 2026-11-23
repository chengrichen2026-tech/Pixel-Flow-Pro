#!/bin/zsh

script_dir="$(cd "$(dirname "$0")" && pwd)"
"$script_dir/start-macos.sh"
status=$?

echo
if [[ $status -eq 0 ]]; then
  echo "API Worker is ready at http://127.0.0.1:43129/health"
else
  echo "API Worker failed to start. Check the runtime/api-worker.macos.error.log file beside the api-worker folder."
fi
echo "Press Return to close this window."
read -r
exit $status
