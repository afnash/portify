@socketio.on("connect")
def handle_connect():
    socketio.emit("update_data", shared_data)

@socketio.on("set_text")
def handle_set_text(data):
    shared_data["text"] = data.get("text", "")
    socketio.emit("update_data", shared_data)

@socketio.on("set_image")
def handle_set_image(data):
    shared_data["image"] = data.get("image", None)
    socketio.emit("update_data", shared_data)

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return {"error": "No file provided"}, 400

    file = request.files["file"]
    if file.filename == "":
        return {"error": "Empty filename"}, 400

    filename = secure_filename(file.filename)
    file.save(os.path.join(UPLOAD_FOLDER, filename))
    file_url = f"/uploads/{filename}"

    shared_data["file"] = {"name": filename, "url": file_url}
    socketio.emit("update_data", shared_data)

    return {"status": "ok", "url": file_url}
