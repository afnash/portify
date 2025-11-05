/**************** DEVICE ID FIRST ****************/
function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{
    const r = Math.random()*16|0; const v = c==="x"?r:(r&3)|8; return v.toString(16);
  });
}
let CLIENT_ID = localStorage.getItem("client-id");
if (!CLIENT_ID) { CLIENT_ID = generateId(); localStorage.setItem("client-id", CLIENT_ID); }
const SEEN = new Set();

/**************** PWA INSTALL ****************/
let deferredPrompt;
const installBtn = document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
});
installBtn?.addEventListener("click", async () => {
  installBtn.hidden = true; deferredPrompt?.prompt(); await deferredPrompt?.userChoice; deferredPrompt = null;
});

/**************** THEME ****************/
const themeBtn = document.getElementById("themeBtn");
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light") document.body.classList.add("light");
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

/**************** SOCKET ****************/
const socket = io({ transports: ["websocket"], upgrade: false });
const netDot = document.getElementById("netDot");
socket.on("connect",()=>{ netDot.className="dot online"; });
socket.on("disconnect",()=>{ netDot.className="dot offline"; });
socket.on("reconnect_attempt",()=>{ netDot.className="dot offline"; });

/**************** DOM ****************/
const feed = document.getElementById("feed");
const msgBox = document.getElementById("msgBox");
const sendBtn = document.getElementById("sendBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const ipLine = document.getElementById("ipLine");
const qr = document.querySelector(".qr");
const qrBody = document.getElementById("qrBody");
const qrToggle = document.getElementById("qrToggle");

/**************** QR COLLAPSIBLE (Update 4) ****************/
function setQrCollapsed(collapsed){
  if (collapsed) qr.classList.add("collapsed"); else qr.classList.remove("collapsed");
  localStorage.setItem("qrCollapsed", collapsed ? "1" : "0");
}
setQrCollapsed(localStorage.getItem("qrCollapsed")==="1");
qrToggle.addEventListener("click", ()=> setQrCollapsed(!qr.classList.contains("collapsed")));

/**************** BOOTSTRAP ****************/
socket.on("bootstrap", ({ messages, ip }) => {
  ipLine.textContent = `Open on phone: http://${ip}:5000`;
  feed.innerHTML = "";
  messages.forEach(addItem);
  autoscroll();
});

/**************** LIVE APPEND ****************/
socket.on("history_append", ({ items }) => {
  items.forEach(addItem);
  // Auto-collapse QR after first real message appears
  if (items && items.length && localStorage.getItem("qrCollapsed")!=="1") {
    setQrCollapsed(true);
  }
  autoscroll();
});

/**************** DELETE ITEMS (Update 21) ****************/
socket.on("delete_items", ({ ids }) => {
  if (!ids) return;
  ids.forEach(id => {
    const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) row.remove();
    SEEN.delete(id);
  });
});

/**************** RENDER MESSAGE ****************/
function addItem(item) {
  if (item.id && SEEN.has(item.id)) return;
  if (item.id) SEEN.add(item.id);

  const row = document.createElement("div");
  row.className = "msg-row" + (item.client_id === CLIENT_ID ? " me" : " peer");
  if (item.id) row.dataset.id = item.id;

  const bubble = document.createElement("div");
  bubble.className = "bubble" + (item.client_id === CLIENT_ID ? " me" : "");

  if (item.type === "text") {
    const p = document.createElement("div");
    p.textContent = item.content;
    bubble.appendChild(p);
  } else if (item.type === "file") {
    const a = document.createElement("a");
    a.href = item.download || item.url;
    a.download = item.name;
    a.className = "filelink";
    a.textContent = "⬇ " + item.name;
    bubble.appendChild(a);

    // File subline (Update 13)
    if (item.size || item.kind) {
      const sub = document.createElement("div");
      const kind = (item.kind || "").split("/")[1] || "file";
      const size = item.size ? niceSize(item.size) : "";
      sub.className = "filesub";
      sub.textContent = [size, kind.toUpperCase()].filter(Boolean).join(" • ");
      bubble.appendChild(sub);
    }

    // Previews
    if (/\.(png|jpe?g|gif|webp)$/i.test(item.name)) {
      const img = document.createElement("img");
      img.src = item.url; img.className = "preview"; bubble.appendChild(img);
    } else if (/\.(mp4|webm|mov)$/i.test(item.name)) {
      const v = document.createElement("video");
      v.src = item.url; v.controls = true; v.className = "preview"; bubble.appendChild(v);
    }
  }

  // Timestamp UNDER bubble (Update 5)
  const ts = document.createElement("div");
  ts.className = "time-under";
  ts.textContent = new Date(item.time || Date.now()).toLocaleTimeString();

  row.appendChild(bubble);
  row.appendChild(ts);
  feed.appendChild(row);
}

function niceSize(bytes){
  const units = ["B","KB","MB","GB","TB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length-1){ n /= 1024; i++; }
  return (i===0 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
}

function autoscroll(){ feed.scrollTop = feed.scrollHeight; }

/**************** SEND TEXT ****************/
sendBtn.addEventListener("click", () => {
  const text = msgBox.value.trim();
  if (!text) return;

  const msg_id = generateId();
  const item = { id: msg_id, type:"text", content:text, time:new Date().toISOString(), client_id: CLIENT_ID };

  addItem(item);
  SEEN.add(msg_id);
  socket.emit("send_text", { text, client_id: CLIENT_ID, id: msg_id });

  msgBox.value = "";
  autoscroll();
});

msgBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

/**************** FILE UPLOAD + PROGRESS (Updates 13, 14) ****************/
fileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) uploadFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter","dragover"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("show"); })
);
["dragleave","drop"].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("show"); })
);
dropzone.addEventListener("drop", e => {
  const files = e.dataTransfer.files;
  if (files?.length) uploadFiles(files);
});

function uploadFiles(files) {
  const ids = [];
  const placeholders = [];

  // Create optimistic placeholders with progress bars
  for (const f of files) {
    const id = generateId();
    ids.push(id);

    const item = {
      id, type:"file", name:f.name, url:"#", download:"#",
      time:new Date().toISOString(), client_id: CLIENT_ID,
      size: f.size, kind: f.type || "application/octet-stream"
    };
    addItem(item);
    placeholders.push(id);

    // attach a progress bar to that row
    const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) {
      const bar = document.createElement("div");
      bar.style.marginTop = "8px";
      bar.style.height = "6px";
      bar.style.borderRadius = "6px";
      bar.style.background = "rgba(255,255,255,.15)";
      const fill = document.createElement("div");
      fill.style.height = "100%";
      fill.style.width = "0%";
      fill.style.borderRadius = "6px";
      fill.style.background = "linear-gradient(90deg,#7aa2ff,#74ffe6)";
      bar.appendChild(fill);
      row.querySelector(".bubble")?.appendChild(bar);
      row.dataset.progressRef = id;
    }
  }

  // Build FormData
  const fd = new FormData();
  for (const f of files) fd.append("files[]", f);
  for (const id of ids) fd.append("ids[]", id);
  fd.append("client_id", CLIENT_ID);

  // Use XHR for progress
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload", true);
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    // update all placeholder bars uniformly (simple, multi-file)
    placeholders.forEach(id => {
      const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      const fill = row?.querySelector('[data-progress]') || null;
    });
    // Better: update each bar; as a simple approach, set all:
    document.querySelectorAll('[data-id]').forEach(r => {
      const bubble = r.querySelector('.bubble');
      const bar = bubble?.lastElementChild;
      if (bar && bar.firstChild && bar.firstChild.style) {
        bar.firstChild.style.width = pct + "%";
      }
    });
  };
  xhr.onload = () => {
    // server will broadcast real items; placeholders remain but progress bars stay; they’ll be replaced visually by real download links
    // Optionally remove bars after short delay:
    setTimeout(()=>{
      placeholders.forEach(id=>{
        const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
        const bubble = row?.querySelector('.bubble');
        const bar = bubble?.lastElementChild;
        if (bar && bar.firstChild && bar.firstChild.style && bar.firstChild.style.width === "100%") {
          bar.remove();
        }
      });
    }, 800);
  };
  xhr.send(fd);
}

/**************** SERVICE WORKER ****************/
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(()=>{});
}
const stopBtn = document.getElementById("stopBtn");
stopBtn.addEventListener("click", () => {
  if (!confirm("Do you really want to stop the server?")) return;

  fetch("/__shutdown__", { method: "POST" })
    .then(() => {
      document.body.innerHTML = `
        <div style="
          font-family: system-ui; 
          display:flex; 
          align-items:center; 
          justify-content:center;
          height:100vh;
          flex-direction:column;
          color:var(--fg);
        ">
          <h2>🔌 Connection Ended</h2>
          <p>Server stopped successfully.</p>
        </div>
      `;
    })
    .catch(() => alert("Unable to stop server."));
});
