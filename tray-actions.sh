#!/bin/bash

APPDIR="$(dirname "$(realpath "$0")")"
cd "$APPDIR"

# Detect python
if [ -x "$APPDIR/venv/bin/python3" ]; then
    PYTHON="$APPDIR/venv/bin/python3"
elif [ -x "$APPDIR/venv/bin/python" ]; then
    PYTHON="$APPDIR/venv/bin/python"
else
    PYTHON=$(find "$APPDIR/venv/bin" -maxdepth 1 -type f -name "python*" | head -n 1)
fi

launch_terminal() {
    /usr/bin/gnome-terminal.real -- bash -c "
        cd \"$APPDIR\";
        \"$PYTHON\" server.py;
        exec bash
    "
}

case "$1" in
    open)
        xdg-open "http://localhost:5000"
        ;;
    restart)
        killall -9 python python3 2>/dev/null
        sleep 1
        launch_terminal
        ;;
    stop)
        killall -9 python python3 2>/dev/null
        ;;
    quit)
        killall -9 python python3 yad 2>/dev/null
        pkill -f "portify-tray.sh"
        ;;
esac
