#!/bin/bash
# Start backend and frontend dev servers

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend..."
cd "$ROOT/backend"
.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting frontend..."
cd "$ROOT/frontend"
/opt/homebrew/bin/npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
