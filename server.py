import os
import json
import threading
from datetime import datetime, timedelta
from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

def load_config():
    if not os.path.exists(CONFIG_PATH):
        cfg = {"download_dir": os.path.expanduser("~/Downloads/Portify")}
        os.makedirs(cfg["download_dir"], exist_ok=True)
        with open(CONFIG_PATH, "w") as f:
            json.dump(cfg, f, indent=4)
        return cfg
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except:
        return {"download_dir": os.path.expanduser("~/Downloads/Portify")}

def save_config(cfg):
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=4)

config = load_config()
UPLOAD_DIR = config["download_dir"]
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

shared_data = {
    "messages": [],
}

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)

@app.route("/set_download_dir", methods=["POST"])
def set_download_dir():
    global UPLOAD_DIR, config
    data = request.json
    new_dir = os.path.expanduser(data.get("download_dir"))
    if not new_dir:
        return {"error": "Invalid directory"}, 400

    os.makedirs(new_dir, exist_ok=True)
    config["download_dir"] = new_dir
    save_config(config)
    UPLOAD_DIR = new_dir
    return {"status": "ok", "download_dir": new_dir}

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return {"error": "No file"}, 400

    file = request.files["file"]
    if file.filename == "":
        return {"error": "Empty filename"}, 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    file_url = f"/uploads/{filename}"
    shared_data["messages"].append({
        "type": "file",
        "name": filename,
        "url": file_url,
        "time": datetime.now().isoformat()
    })

    socketio.emit("update", shared_data)
    return {"status": "ok", "url": file_url}

@socketio.on("send_text")
def handle_text(data):
    text = data.get("text", "")
    if text.strip():
        shared_data["messages"].append({
            "type": "text",
            "content": text,
            "time": datetime.now().isoformat()
        })
        socketio.emit("update", shared_data)

def auto_clean(hours=24):
    cutoff = timedelta(hours=hours)
    while True:
        try:
            now = datetime.now()
            for fn in os.listdir(UPLOAD_DIR):
                fp = os.path.join(UPLOAD_DIR, fn)
                if not os.path.isfile(fp): continue
                mtime = datetime.fromtimestamp(os.path.getmtime(fp))
                if now - mtime > cutoff:
                    os.remove(fp)
        except Exception as e:
            print("Cleaner error:", e)
        import time
        time.sleep(60)

threading.Thread(target=auto_clean, daemon=True).start()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
