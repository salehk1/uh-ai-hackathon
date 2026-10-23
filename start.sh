#!/usr/bin/env bash
# Start the FastAPI backend (internal) and the Next.js frontend (public) in one machine.
# If either exits, exit too so Fly restarts the machine instead of serving half an app.
set -u
uvicorn api.main:app --host 127.0.0.1 --port 8000 &
(cd /app/web && HOSTNAME=0.0.0.0 PORT=8080 exec node server.js) &
wait -n
echo "a service exited; stopping so Fly restarts the machine" >&2
exit 1
