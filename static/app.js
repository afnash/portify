/*********************************************************
 * DEVICE ID FIRST
 *********************************************************/
function generateId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 3) | 8;
        return v.toString(16);
    });
}

let CLIENT_ID = localStorage.getItem("client-id");
if (!CLIENT_ID) {
    CLIENT_ID = generateId();
    localStorage.setItem("client-id", CLIENT_ID);
}

const SEEN = new Set();

/*********************************************************
 * PWA INSTALL PROMPT
 *********************************************************/
let deferredPrompt;
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn?.addEventListener("click", async () => {
  installBtn.hidden = true;
  deferredPrompt?.prompt();
  await deferredPrompt?.userChoice;
  deferredPrompt = null;
});

/*********************************************************
 * THEME
 *********************************************************/
const themeBtn = document.getElementById("themeBtn");
const savedTheme = localStorage.getItem("theme");

if (savedTheme === "light") document.body.classList.add("light");

themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
});

/*********************************************************
 * SOCKET
 *********************************************************/
const socket = io({ transports: ["websocket"], upgrade: false });

const netDot = document.getElementById("netDot");
socket.on("connect", () => {
  netDot.className = "dot online";
});
socket.on("disconnect", () => {
  netDot.className = "dot offline";
});
socket.on("reconnect_attempt", () => {
  netDot.className = "dot offline";
});

/*********************************************************
 * DOM
 *********************************************************/
const feed = document.getElementById("feed");
const msgBox = document.getElementById("msgBox");
const sendBtn = document.getElementById("sendBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const ipLine   = document.getElementById("ipLine");

/*********************************************************
 * BOOTSTRAP HISTORY
 *********************************************************/
socket.on("bootstrap", ({ messages, ip }) => {
  ipLine.textContent = `Scan or open: http://${ip}:5000`;
  feed.innerHTML = "";
  messages.forEach(addItem);
  autoscroll();
});

/*********************************************************
 * LIVE APPEND
 *********************************************************/
socket.on("history_append", ({ items }) => {
  items.forEach(addItem);
  autoscroll();
});

/*********************************************************
 * RENDER MESSAGE
 *********************************************************/
function addItem(item) {
  if (item.id && SEEN.has(item.id)) return;
  if (item.id) SEEN.add(item.id);

  const row = document.createElement("div");
  row.className = "msg-row " + (item.client_id === CLIENT_ID ? "me" : "peer");

  const wrap = document.createElement("div");
  wrap.className = "bubble" + (item.client_id === CLIENT_ID ? " me" : "");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = new Date(item.time || Date.now()).toLocaleTimeString();
  wrap.appendChild(meta);

  if (item.type === "text") {
    const p = document.createElement("div");
    p.textContent = item.content;
    wrap.appendChild(p);
  }

  if (item.type === "file") {
    const a = document.createElement("a");
    a.href = item.download || item.url;
    a.download = item.name;
    a.className = "filelink";
    a.textContent = "⬇ " + item.name;
    wrap.appendChild(a);

    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(item.name)) {
      const img = document.createElement("img");
      img.src = item.url;
      img.className = "preview";
      wrap.appendChild(img);
    }

    if (/\.(mp4|webm)$/i.test(item.name)) {
      const v = document.createElement("video");
      v.src = item.url;
      v.controls = true;
      v.className = "preview";
      wrap.appendChild(v);
    }
  }

  row.appendChild(wrap);
  feed.appendChild(row);
}

function autoscroll() {
  feed.scrollTop = feed.scrollHeight;
}

/*********************************************************
 * SEND TEXT
 *********************************************************/
sendBtn.addEventListener("click", () => {
  const text = msgBox.value.trim();
  if (!text) return;

  const msg_id = generateId();

  const item = {
    id: msg_id,
    type: "text",
    content: text,
    time: new Date().toISOString(),
    client_id: CLIENT_ID
  };

  addItem(item);
  SEEN.add(msg_id);

  socket.emit("send_text", { text, client_id: CLIENT_ID, id: msg_id });

  msgBox.value = "";
  autoscroll();
});

msgBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

/*********************************************************
 * FILE UPLOAD
 *********************************************************/
fileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) uploadFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter","dragover"].forEach(evt =>
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.add("show");
  })
);
["dragleave","drop"].forEach(evt =>
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.remove("show");
  })
);

dropzone.addEventListener("drop", e => {
  const files = e.dataTransfer.files;
  if (files?.length) uploadFiles(files);
});

function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files[]", f);

  fetch("/upload", { method: "POST", body: fd });

  for (const f of files) {
    const id = generateId();
    SEEN.add(id);
    addItem({
      id,
      type: "file",
      name: f.name,
      url: "#",
      download: "#",
      time: new Date().toISOString(),
      client_id: CLIENT_ID
    });
  }

  autoscroll();
}

/*********************************************************
 * SERVICE WORKER
 *********************************************************/
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}
