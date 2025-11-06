#!/bin/bash

APPDIR="$(dirname "$(realpath "$0")")"
cd "$APPDIR"

# Prevent duplicate tray icons
if pgrep -f "portify-tray.sh" | grep -v $$ > /dev/null; then
    exit 0
fi

# Auto-detect python in venv
if [ -x "$APPDIR/venv/bin/python3" ]; then
    PYTHON="$APPDIR/venv/bin/python3"
elif [ -x "$APPDIR/venv/bin/python" ]; then
    PYTHON="$APPDIR/venv/bin/python"
else
    PYTHON=$(find "$APPDIR/venv/bin" -maxdepth 1 -type f -name "python*" | head -n 1)
fi

# Function to open server in terminal (OTP visible)
launch_terminal() {
    /usr/bin/gnome-terminal.real -- bash -c "
        cd \"$APPDIR\";
        \"$PYTHON\" server.py;
        exec bash
    "
}

# Start server if not already running
if ! pgrep -f "server.py" > /dev/null ; then
    launch_terminal
    sleep 2
    xdg-open "http://localhost:5000" >/dev/null 2>&1 &
fi


# ---- TRAY ICON ----
yad --notification \
    --image="$APPDIR/static/assets/logo192.png" \
    --text="Portify Running" \
    --command="xdg-open http://localhost:5000" \
    --menu="Open UI!$APPDIR/tray-actions.sh open\
           |Restart Server!$APPDIR/tray-actions.sh restart\
           |Stop Server!$APPDIR/tray-actions.sh stop\
           |Quit!$APPDIR/tray-actions.sh quit"
