#!/usr/bin/env bash
set -euo pipefail

CLOUD_RUN_PORT="${PORT:-8080}"

# Keep Canvas and its real session key on an internal listener. The public
# gateway exposes a harmless browser key and enforces the fixed demo policy.
export PORT=8081
unset PUBLIC_MODE_PORT
export PUBLIC_GATEWAY_PORT="$CLOUD_RUN_PORT"
export CANVAS_INTERNAL_PORT=8081
export VITE_DO_NOT_TRACK=1
export DO_NOT_TRACK=1
# ACP reserves stdout for JSON-RPC; route terminal chrome and diagnostics to stderr.
export EVOLOOM_STDIO_PROTOCOL=1
export EVOLOOM_WORKSPACE="${EVOLOOM_WORKSPACE:-/workspace}"
export EVOLOOM_PUBLIC_MODE=1
: "${LOCAL_BACKEND_API_KEY:?LOCAL_BACKEND_API_KEY is required}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY is required}"
export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
export MODEL="${MODEL:-gpt-4o-mini}"
export EVOLOOM_PUBLIC_MODELS="${EVOLOOM_PUBLIC_MODELS:-${MODEL}}"
export OH_SESSION_API_KEYS_0="${OH_SESSION_API_KEYS_0:-${LOCAL_BACKEND_API_KEY}}"

mkdir -p "$EVOLOOM_WORKSPACE"

configure_evoloom() {
  local attempts=0
  until curl --silent --fail --max-time 2 \
    -H "X-Session-API-Key: ${LOCAL_BACKEND_API_KEY}" \
    http://127.0.0.1:18000/api/settings >/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      echo "[evoloom] agent-server did not become ready" >&2
      return 1
    fi
    sleep 1
  done

  curl --silent --fail --show-error --max-time 10 \
    -X PATCH \
    -H "Content-Type: application/json" \
    -H "X-Session-API-Key: ${LOCAL_BACKEND_API_KEY}" \
    --data '{"agent_settings_diff":{"agent_kind":"acp","acp_server":"codex","acp_command":["evoloom-acp"],"acp_model":"'"${MODEL}"'"},"misc_settings_diff":{"telemetry":{"consent":false}}}' \
    http://127.0.0.1:18000/api/settings >/dev/null
  echo "[evoloom] Agent Canvas configured for the EvoLoom ACP adapter"
}

configure_evoloom &
/opt/agent-canvas/entrypoint.sh &
CANVAS_PID=$!

cleanup() {
  kill "$CANVAS_PID" 2>/dev/null || true
  wait "$CANVAS_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Do not open Cloud Run's public port until Canvas is ready. This turns cold
# starts into normal request queuing instead of a transient 502 page.
attempts=0
until curl --silent --fail --max-time 2 http://127.0.0.1:8081/alive >/dev/null; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 90 ]; then
    echo "[evoloom] Canvas did not become ready" >&2
    exit 1
  fi
  sleep 1
done

node /opt/evoloom/scripts/public-gateway.mjs &
GATEWAY_PID=$!
wait "$GATEWAY_PID"
