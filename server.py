import os, io, socket, threading, time, mimetypes, secrets, random, logging,sys
class NullWriter(io.TextIOBase):
    def write(self, _): 
        return 0

sys.stderr = NullWriter()  # completely silence Werkzeug stderr output
logging.getLogger('werkzeug').setLevel(logging.ERROR)
from datetime import datetime, timedelta
from flask import Flask, send_from_directory, send_file, request, abort
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename

# --- Silence noisy Werkzeug logs ---
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# --- Paths / App ---
BASE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE, "static")
DOWNLOAD_DIR = os.path.expanduser("~/Downloads/Portify")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# --- Session Security ---
SESSION_ID = secrets.token_hex(8)
OTP = f"{random.randint(0, 999999):06d}"
verified_sids = set()
upload_tokens = set()

print(f"[Portify] Session: {SESSION_ID}")
print(f"[Portify] OTP (share locally only): {OTP}")

# --- In-memory state ---
STATE = {"messages": []}

# --- Helpers ---
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
            return f"{num:.0f} {unit}" if unit == "B" else f"{num:.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} PB"

# --- Routes (static/PWA/QR) ---
@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/manifest.json")
def manifest():
    return send_from_directory(STATIC_DIR, "manifest.json")

@app.route("/service-worker.js")
def sw():
    return send_from_directory(STATIC_DIR, "service-worker.js", mimetype="application/javascript")

@app.route("/uploads/<path:filename>")
def uploads(filename):
    return send_from_directory(DOWNLOAD_DIR, filename)

@app.route("/download/<path:filename>")
def download(filename):
    return send_from_directory(DOWNLOAD_DIR, filename, as_attachment=True)

@app.route("/qrcode.png")
def qrcode_png():
    try:
        import qrcode
        img = qrcode.make(f"http://{lan_ip()}:5000")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return send_file(buf, mimetype="image/png")
    except Exception:
        # tiny valid PNG header fallback
        return send_file(io.BytesIO(b"\x89PNG\r\n\x1a\n"), mimetype="image/png")

# --- Secure Upload (requires token) ---
@app.route("/upload", methods=["POST"])
def upload():
    token = request.form.get("token", "")
    if token not in upload_tokens:
        return {"error": "Unauthorized"}, 403

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
            "id": (ids[idx] if idx < len(ids) else secrets.token_hex(6)),
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

# --- Stop server endpoint (from UI) ---
@app.route("/__shutdown__", methods=["POST"])
def shutdown():
    func = request.environ.get("werkzeug.server.shutdown")
    if func is None:
        abort(500)
    try:
        socketio.stop()
    finally:
        func()
    return "Server shutting down..."

# --- Socket events ---
from flask import request

@socketio.on("connect")
def on_connect():
    socketio.emit("otp_required", {"session": SESSION_ID}, to=request.sid)

@socketio.on("disconnect")
def on_disconnect():
    verified_sids.discard(request.sid)

@socketio.on("verify_otp")
def verify_otp(data):
    sid = request.sid
    user_otp = (data or {}).get("otp", "")
    if user_otp == OTP:
        verified_sids.add(sid)
        token = secrets.token_hex(16)
        upload_tokens.add(token)
        socketio.emit("otp_ok", {"token": token}, to=sid)
        socketio.emit("bootstrap", {"messages": STATE["messages"], "ip": lan_ip()}, to=sid)
    else:
        socketio.emit("otp_fail", {}, to=sid)

@socketio.on("verify_token")
def verify_token(data):
    sid = request.sid
    token = (data or {}).get("token", "")
    if token in upload_tokens:
        verified_sids.add(sid)
        socketio.emit("otp_ok", {"token": token}, to=sid)
        socketio.emit("bootstrap", {"messages": STATE["messages"], "ip": lan_ip()}, to=sid)
    else:
        socketio.emit("otp_fail", {}, to=sid)

@socketio.on("send_text")
def on_send_text(data):
    if request.sid not in verified_sids:
        return
    text = (data or {}).get("text", "").strip()
    if not text:
        return
    item = {
        "id": (data.get("id") or secrets.token_hex(6)),
        "type": "text",
        "content": text,
        "time": now_iso(),
        "client_id": data.get("client_id")
    }
    STATE["messages"].append(item)
    socketio.emit("history_append", {"items": [item]})

# --- Auto delete (24h) ---
def auto_delete(hours=24, interval_sec=1800):
    cutoff = timedelta(hours=hours)
    while True:
        try:
            now = datetime.now()
            keep, deleted_ids = [], []
            for item in STATE["messages"]:
                try:
                    ts = datetime.fromisoformat(item["time"])
                except:
                    ts = now
                if now - ts > cutoff:
                    if item.get("type") == "file":
                        fp = os.path.join(DOWNLOAD_DIR, item.get("name", ""))
                        if os.path.isfile(fp):
                            try:
                                os.remove(fp)
                            except:
                                pass
                    deleted_ids.append(item.get("id"))
                else:
                    keep.append(item)
            if deleted_ids:
                STATE["messages"] = keep
                socketio.emit("delete_items", {"ids": deleted_ids})
        except Exception as e:
            print("[AutoDelete]", e)
        time.sleep(interval_sec)

threading.Thread(target=auto_delete, daemon=True).start()

# --- Entry ---
if __name__ == "__main__":
    ip = lan_ip()
    port = 5000
    print(f"[Portify] Running on http://{ip}:{port}")
    socketio.run(app, host="0.0.0.0", port=port)
