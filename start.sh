#!/usr/bin/env bash
# Start Lattice locally with one command.
#
#   ./start.sh             start the app (or reopen it if already running)
#   ./start.sh --no-open   start without opening a browser
#   PORT=4000 ./start.sh   use another port (default 3000)
#
# Checks Node.js, installs dependencies when package-lock.json changed, applies
# pending database migrations (wrangler asks before applying a new one), then
# runs the dev server in this terminal. Press Ctrl+C to stop.
# Your library is stored in .wrangler/state/ and is kept between runs.
set -euo pipefail

cd "$(dirname "$0")"

HOST=127.0.0.1
PORT="${PORT:-3000}"
OPEN_BROWSER=1
LOCK=.vinext/dev/lock.json

for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_BROWSER=0 ;;
    -h | --help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see ./start.sh --help)" >&2
      exit 2
      ;;
  esac
done

info() { printf '\033[36m▸\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31m✗\033[0m %s\n' "$*" >&2
  exit 1
}

open_url() {
  [ "$OPEN_BROWSER" = 1 ] || return 0
  if command -v open >/dev/null; then
    open "$1"
  elif command -v xdg-open >/dev/null; then
    xdg-open "$1" >/dev/null 2>&1
  fi
}

# Prints the URL of the dev server recorded in vinext's lock file, if that
# process is still alive.
running_url() {
  [ -f "$LOCK" ] || return 1
  node -e '
    const { pid, appUrl } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    try { process.kill(pid, 0); } catch { process.exit(1); }
    if (!appUrl) process.exit(1);
    console.log(appUrl);
  ' "$LOCK" 2>/dev/null
}

# 1. Node.js at the version package.json "engines" asks for (a ">=x.y.z" range).
command -v node >/dev/null ||
  fail "Node.js is not installed. Install $(sed -n 's/.*"node": *"\(.*\)".*/\1/p' package.json) from https://nodejs.org"
node -e '
  const need = require("./package.json").engines.node.replace(/[^0-9.]/g, "").split(".").map(Number);
  const have = process.versions.node.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((have[i] ?? 0) !== (need[i] ?? 0)) process.exit((have[i] ?? 0) > (need[i] ?? 0) ? 0 : 1);
  }
' || fail "Node.js $(node -v) is too old; Lattice needs $(node -p 'require("./package.json").engines.node')."

# 2. Already running? Reuse it rather than starting a second server.
if url=$(running_url); then
  info "Lattice is already running at $url"
  open_url "$url"
  exit 0
fi

# 3. Dependencies: install when missing or when package-lock.json changed.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  info "Installing dependencies (npm ci)…"
  npm ci
fi

# 4. Open the browser once the server answers. The URL comes from the lock file,
#    so it stays correct even if the server has to pick another port.
if [ "$OPEN_BROWSER" = 1 ]; then
  (
    for _ in $(seq 1 120); do
      sleep 0.5
      url=$(running_url) || continue
      if curl -sf -o /dev/null "$url"; then
        open_url "$url"
        exit 0
      fi
    done
  ) &
fi

# 5. Dev server in the foreground; "predev" applies database migrations first.
info "Starting Lattice on http://$HOST:$PORT (Ctrl+C to stop)…"
exec npm run dev -- --host "$HOST" --port "$PORT"
