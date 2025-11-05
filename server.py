from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit

app = Flask(__name__, static_folder="static")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

shared_data = {"text": ""}

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")

@app.route("/service-worker.js")
def sw():
    return send_from_directory("static", "service-worker.js")

# --- SOCKET EVENTS ---
@socketio.on("connect")
def handle_connect():
    emit("update_text", shared_data, broadcast=True)

@socketio.on("set_text")
def handle_set_text(data):
    shared_data["text"] = data.get("text", "")
    emit("update_text", shared_data, broadcast=True)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
