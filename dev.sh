#!/bin/bash
# Qualys2Human - Dev Server Manager
# Usage: ./dev.sh [start|stop|restart|status]

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PID_DIR="$PROJECT_DIR/.pids"

mkdir -p "$PID_DIR"

start_backend() {
    if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
        echo "[backend] Already running (PID $(cat "$PID_DIR/backend.pid"))"
        return
    fi
    echo "[backend] Starting FastAPI on http://127.0.0.1:8000 ..."
    cd "$BACKEND_DIR"
    python -m uvicorn q2h.main:app --host 127.0.0.1 --port 8000 --reload > "$PID_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"
    echo "[backend] Started (PID $!)"
}

start_frontend() {
    if [ -f "$PID_DIR/frontend.pid" ] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
        echo "[frontend] Already running (PID $(cat "$PID_DIR/frontend.pid"))"
        return
    fi
    echo "[frontend] Starting Vite on http://localhost:3000 ..."
    cd "$FRONTEND_DIR"
    npm run dev > "$PID_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid"
    echo "[frontend] Started (PID $!)"
}

stop_process() {
    local name=$1
    local pidfile="$PID_DIR/$name.pid"
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo "[$name] Stopping (PID $pid) ..."
            kill "$pid" 2>/dev/null
            # Wait up to 5 seconds for graceful shutdown
            for i in $(seq 1 10); do
                kill -0 "$pid" 2>/dev/null || break
                sleep 0.5
            done
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
            echo "[$name] Stopped"
        else
            echo "[$name] Not running (stale PID file)"
        fi
        rm -f "$pidfile"
    else
        echo "[$name] Not running"
    fi
}

show_status() {
    for name in backend frontend; do
        local pidfile="$PID_DIR/$name.pid"
        if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
            echo "[$name] Running (PID $(cat "$pidfile"))"
        else
            echo "[$name] Stopped"
        fi
    done
}

show_logs() {
    local name=${1:-backend}
    local logfile="$PID_DIR/$name.log"
    if [ -f "$logfile" ]; then
        tail -50 "$logfile"
    else
        echo "No log file for $name"
    fi
}

case "${1:-help}" in
    start)
        start_backend
        start_frontend
        echo ""
        echo "--- Qualys2Human Dev ---"
        echo "Frontend : http://localhost:3000"
        echo "Backend  : http://127.0.0.1:8000"
        echo "API docs : http://127.0.0.1:8000/docs"
        echo "Logs     : ./dev.sh logs [backend|frontend]"
        ;;
    stop)
        stop_process frontend
        stop_process backend
        ;;
    restart)
        stop_process frontend
        stop_process backend
        sleep 1
        start_backend
        start_frontend
        echo ""
        echo "--- Restarted ---"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "${2:-backend}"
        ;;
    *)
        echo "Qualys2Human Dev Server"
        echo ""
        echo "Usage: ./dev.sh [command]"
        echo ""
        echo "  start    Start backend + frontend"
        echo "  stop     Stop everything"
        echo "  restart  Restart everything"
        echo "  status   Show running status"
        echo "  logs     Show logs (./dev.sh logs [backend|frontend])"
        ;;
esac
