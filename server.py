import os, io, socket, json, threading, time, mimetypes
from datetime import datetime, timedelta
from flask import Flask, send_from_directory, send_file, request
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename

try:
    import qrcode
except ImportError:
    qrcode = None

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE, "static")
DOWNLOAD_DIR = os.path.expanduser("~/Downloads/Portify")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

STATE = {"messages": []}  # list of items {id,type,content/name,url,download,time,client_id,size,kind}

def now_iso():
    return datetime.now().isoformat()

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def human_size(num):
    for unit in ["B","KB","MB","GB","TB"]:
        if num < 1024.0:
            return f"{num:.0f} {unit}" if unit=="B" else f"{num:.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} PB"

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/manifest.json")
def manifest():
    return send_from_directory(STATIC_DIR, "manifest.json")

@app.route("/service-worker.js")
def sw():
    return send_from_directory(STATIC_DIR, "service-worker.js")

@app.route("/uploads/<path:filename>")
def uploads(filename):
    return send_from_directory(DOWNLOAD_DIR, filename)

@app.route("/download/<path:filename>")
def download(filename):
    return send_from_directory(DOWNLOAD_DIR, filename, as_attachment=True)

@app.route("/qrcode.png")
def qrcode_png():
    url = f"http://{lan_ip()}:5000"
    if qrcode is None:
        buf = io.BytesIO(b"\x89PNG\r\n\x1a\n")
        return send_file(buf, mimetype="image/png")
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")

@app.route("/upload", methods=["POST"])
def upload():
    """
    Supports multi-file upload with per-file client-generated IDs (ids[])
    and client_id for sender attribution.
    """
    files = request.files.getlist("files[]")
    ids = request.form.getlist("ids[]")
    client_id = request.form.get("client_id")
    posted = []

    for idx, f in enumerate(files):
        if not f or not f.filename:
            continue
        name = secure_filename(f.filename)
        path = os.path.join(DOWNLOAD_DIR, name)
        f.save(path)
        size = os.path.getsize(path)
        url = f"/uploads/{name}"
        dl = f"/download/{name}"
        kind, _ = mimetypes.guess_type(name)
        item = {
            "id": (ids[idx] if idx < len(ids) else f"file-{int(time.time()*1000)+idx}"),
            "type": "file",
            "name": name,
            "url": url,
            "download": dl,
            "time": now_iso(),
            "client_id": client_id,
            "size": size,
            "kind": kind or "application/octet-stream",
        }
        STATE["messages"].append(item)
        posted.append(item)

    if posted:
        socketio.emit("history_append", {"items": posted})
    return {"ok": True}

# --- SOCKET EVENTS ---

from flask import request

@socketio.on("connect")
def on_connect():
    # Send bootstrap ONLY to this client (fixes clearing on other devices)
    socketio.emit(
        "bootstrap",
        {"messages": STATE["messages"], "ip": lan_ip()},
        to=request.sid
    )

@socketio.on("send_text")
def on_send_text(data):
    text = (data or {}).get("text", "").strip()
    if not text:
        return
    item = {
        "id": data.get("id"),
        "type": "text",
        "content": text,
        "time": now_iso(),
        "client_id": data.get("client_id")
    }
    STATE["messages"].append(item)
    socketio.emit("history_append", {"items": [item]})

# --- AUTO DELETE (UPDATE 21) ---

def auto_delete(hours=24, interval_sec=1800):
    cutoff = timedelta(hours=hours)
    while True:
        try:
            now = datetime.now()
            keep = []
            deleted_ids = []
            for item in STATE["messages"]:
                try:
                    ts = datetime.fromisoformat(item["time"])
                except Exception:
                    ts = now
                if now - ts > cutoff:
                    if item.get("type") == "file":
                        fp = os.path.join(DOWNLOAD_DIR, item.get("name",""))
                        if os.path.isfile(fp):
                            try:
                                os.remove(fp)
                            except Exception:
                                pass
                    deleted_ids.append(item.get("id"))
                else:
                    keep.append(item)
            if deleted_ids:
                STATE["messages"] = keep
                socketio.emit("delete_items", {"ids": deleted_ids})
        except Exception as e:
            print("AutoDelete error:", e)
        time.sleep(interval_sec)

threading.Thread(target=auto_delete, daemon=True).start()

from flask import abort

@app.route("/__shutdown__", methods=["POST"])
def shutdown():
    func = request.environ.get("werkzeug.server.shutdown")
    if func is None:
        abort(500)
    socketio.stop()  # stop socketio
    func()           # stop flask
    return "Server shutting down..."


if __name__ == "__main__":
    print(f"Portify on http://{lan_ip()}:5000")
    socketio.run(app, host="0.0.0.0", port=5000)
