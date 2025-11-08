#!/bin/bash

APPDIR="$(dirname "$(realpath "$0")")"
cd "$APPDIR"

# Prevent multiple tray icons
if pgrep -f "portify-tray.sh" | grep -v $$ > /dev/null; then
    exit 0
fi

# Auto-detect Python
if [ -x "$APPDIR/venv/bin/python" ]; then
    PYTHON="$APPDIR/venv/bin/python"
elif [ -x "$APPDIR/venv/bin/python3" ]; then
    PYTHON="$APPDIR/venv/bin/python3"
else
    PYTHON=$(which python3)
fi

# Start server if not running
if ! pgrep -f "server.py" > /dev/null ; then
    nohup "$PYTHON" "$APPDIR/server.py" > /dev/null 2>&1 &
    sleep 2
fi

# Start tray icon
yad --notification \
    --image="$APPDIR/static/assets/logo192.png" \
    --text="Portify Running" \
    --menu="Open UI!xdg-open http://localhost:5000|Restart Server!bash -c 'pkill -f server.py; nohup $PYTHON $APPDIR/server.py > /dev/null 2>&1 &'|Stop Server!pkill -f server.py|Quit!pkill -f yad"
