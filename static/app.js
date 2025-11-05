const socket = io();
const messagesDiv = document.getElementById("messages");
const textBox = document.getElementById("textBox");
const sendBtn = document.getElementById("sendTextBtn");
const fileBtn = document.getElementById("sendFileBtn");
const fileInput = document.getElementById("fileInput");
const themeToggle = document.getElementById("themeToggle");
const chooseFolder = document.getElementById("chooseFolder");

sendBtn.onclick = () => {
    let text = textBox.value.trim();
    if (!text) return;

    socket.emit("send_text", { text });
    textBox.value = "";
};

fileBtn.onclick = () => fileInput.click();

fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);

    await fetch("/upload", {
        method: "POST",
        body: fd
    });
};

socket.on("update", data => {
    messagesDiv.innerHTML = "";

    data.messages.forEach(msg => {
        const div = document.createElement("div");
        div.className = "msg";

        if (msg.type === "text") {
            div.textContent = msg.content;
        } else if (msg.type === "file") {
            div.innerHTML = `
                <strong>${msg.name}</strong><br>
                <a href="${msg.url}" download>Download</a>
            `;
        }

        messagesDiv.appendChild(div);
    });

    messagesDiv.scrollTo(0, messagesDiv.scrollHeight);
});

themeToggle.onclick = () => {
    document.body.classList.toggle("light");
};

chooseFolder.onclick = async () => {
    const newDir = prompt("Enter download folder path:");
    if (!newDir) return;

    let res = await fetch("/set_download_dir", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ download_dir: newDir })
    });

    const data = await res.json();
    alert("Saved to: " + data.download_dir);
};
