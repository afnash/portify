import os, io, socket, json, threading, time
from datetime import datetime, timedelta
from flask import Flask, send_from_directory, send_file, request
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename

# QR code
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

# simple in-memory history
STATE = {"messages": []}  # {id, type: text|file|image, ...}

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

# ---------- Routes ----------
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
    # force download instead of inline view
    return send_from_directory(DOWNLOAD_DIR, filename, as_attachment=True)

@app.route("/qrcode.png")
def qrcode_png():
    url = f"http://{lan_ip()}:5000"
    if qrcode is None:
        # tiny fallback image
        buf = io.BytesIO(b"\x89PNG\r\n\x1a\n")
        return send_file(buf, mimetype="image/png")
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")

@app.route("/upload", methods=["POST"])
def upload():
    files = request.files.getlist("files[]") or [request.files.get("file")]
    posted = []
    for f in files:
        if not f or f.filename == "":
            continue
        name = secure_filename(f.filename)
        path = os.path.join(DOWNLOAD_DIR, name)
        f.save(path)
        url = f"/uploads/{name}"
        dl = f"/download/{name}"
        item = {
            "id": f"file-{int(time.time()*1000)}",
            "type": "file",
            "name": name,
            "url": url,
            "download": dl,
            "time": now_iso(),
        }
        STATE["messages"].append(item)
        posted.append(item)
    if posted:
        socketio.emit("history_append", {"items": posted})
    return {"ok": True, "items": posted}

# ---------- Socket events ----------
@socketio.on("connect")
def on_connect():
    socketio.emit("bootstrap", {"messages": STATE["messages"], "ip": lan_ip()})

@socketio.on("send_text")
def on_send_text(data):
    text = (data or {}).get("text", "").strip()
    if not text:
        return
    item = {
        "id": f"text-{int(time.time()*1000)}",
        "type": "text",
        "content": text,
        "time": now_iso(),
    }
    STATE["messages"].append(item)
    item["client_id"] = data.get("client_id")
    socketio.emit("history_append", {"items": [item]})

# ---------- (Optional) auto-clean old downloads ----------
def auto_clean(hours=24, every_sec=1800):
    cutoff = timedelta(hours=hours)
    while True:
        try:
            now = datetime.now()
            for fn in os.listdir(DOWNLOAD_DIR):
                fp = os.path.join(DOWNLOAD_DIR, fn)
                if not os.path.isfile(fp): continue
                mtime = datetime.fromtimestamp(os.path.getmtime(fp))
                if now - mtime > cutoff:
                    os.remove(fp)
        except Exception as e:
            print("Cleaner:", e)
        time.sleep(every_sec)

threading.Thread(target=auto_clean, daemon=True).start()

if __name__ == "__main__":
    print(f"Portify → http://{lan_ip()}:5000")
    socketio.run(app, host="0.0.0.0", port=5000)
