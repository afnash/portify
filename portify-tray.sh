#!/bin/bash

APPDIR="$(dirname "$(realpath "$0")")"
cd "$APPDIR"

# Prevent multiple tray icons
if pgrep -f "portify-tray.sh" | grep -v $$ > /dev/null; then
    exit 0
fi

# Detect Python interpreter
if [ -x "$APPDIR/venv/bin/python" ]; then
    PYTHON="$APPDIR/venv/bin/python"
elif [ -x "$APPDIR/venv/bin/python3" ]; then
    PYTHON="$APPDIR/venv/bin/python3"
else
    PYTHON=$(command -v python3)
fi

# Start the server if not already running
if ! pgrep -f "server.py" > /dev/null ; then
    # Run server in terminal (visible for OTP)
    x-terminal-emulator -e "$PYTHON $APPDIR/server.py" &
    sleep 3
    # Open the UI automatically in browser
    xdg-open "http://localhost:5000" >/dev/null 2>&1 &
fi

# Tray icon
yad --notification \
    --image="$APPDIR/static/assets/logo192.png" \
    --text="Portify Running" \
    --command="xdg-open http://localhost:5000" \
    --menu="Open UI!xdg-open http://localhost:5000|Restart Server!bash -c 'killall -9 python3 python; sleep 1; x-terminal-emulator -e \"$PYTHON $APPDIR/server.py\" & sleep 3; xdg-open http://localhost:5000 &'|Stop Server!killall -9 python3 python|Quit!killall -9 python3 python yad"
