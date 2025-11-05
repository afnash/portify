#!/bin/bash

APPDIR="$(dirname "$(realpath "$0")")"
cd "$APPDIR"

# Prevent multiple tray icons
if pgrep -f "portify-tray.sh" | grep -v $$ > /dev/null; then
    exit 0
fi

# Auto-detect python in venv
if [ -x "$APPDIR/venv/bin/python" ]; then
    PYTHON="$APPDIR/venv/bin/python"
elif [ -x "$APPDIR/venv/bin/python3" ]; then
    PYTHON="$APPDIR/venv/bin/python3"
else
    PYTHON=$(find "$APPDIR/venv/bin" -maxdepth 1 -type f -name "python*" | head -n 1)
fi

# Start server if not running
if ! pgrep -f "server.py" > /dev/null ; then
    nohup "$PYTHON" "$APPDIR/server.py" > /dev/null 2>&1 &
    sleep 2
fi

# Start tray icon ONLY once
yad --notification \
    --image="$APPDIR/static/assets/logo192.png" \
    --text="Portify Running" \
    --command="xdg-open http://localhost:5000" \
    --menu="Open UI!xdg-open http://localhost:5000|Restart Server!bash -c 'killall -9 python3 python; sleep 1; nohup $PYTHON $APPDIR/server.py > /dev/null 2>&1 &'|Stop Server!killall -9 python3 python|Quit!exit"
