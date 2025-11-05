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

  // 1) Create placeholders + progress UI
  for (const f of files) {
    const id = generateId();
    ids.push(id);

    const item = {
      id,
      type: "file",
      name: f.name,
      url: "#",
      download: "#",
      time: new Date().toISOString(),
      client_id: CLIENT_ID,
      size: f.size,
      kind: f.type || "application/octet-stream"
    };

    // Render bubble
    addItem(item);
    placeholders.push(id);

    // Attach progress components to bubble
    const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const bubble = row?.querySelector(".bubble");
    if (bubble) {
      // PROGRESS BAR
      const bar = document.createElement("div");
      bar.className = "upbar";

      const fill = document.createElement("div");
      fill.className = "upfill";
      bar.appendChild(fill);

      // SPEED LINE
      const sp = document.createElement("div");
      sp.className = "speedline";
      sp.textContent = "Starting…";

      bubble.appendChild(bar);
      bubble.appendChild(sp);
    }
  }

  // 2) Build FormData
  const fd = new FormData();
  for (const f of files) fd.append("files[]", f);
  for (const id of ids) fd.append("ids[]", id);
  fd.append("client_id", CLIENT_ID);

  // 3) Upload with XHR (needed for progress)
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload", true);

  const startTime = Date.now();

  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;

    const pct = Math.round((e.loaded / e.total) * 100);
    const elapsed = (Date.now() - startTime) / 1000; // sec
    const speed = e.loaded / elapsed;                // bytes/sec
    const remaining = e.total - e.loaded;
    const eta = remaining / speed;                   // sec

    const niceSpeed = speed > 1_000_000
      ? (speed / 1_000_000).toFixed(1) + " MB/s"
      : (speed / 1000).toFixed(1) + " KB/s";

    const niceETA = eta > 60
      ? Math.round(eta/60) + "m"
      : Math.round(eta) + "s";

    // Update every placeholder bubble
    placeholders.forEach(id => {
      const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!row) return;

      const bubble = row.querySelector(".bubble");

      const fill = bubble?.querySelector(".upfill");
      if (fill) fill.style.width = pct + "%";

      const sp = bubble?.querySelector(".speedline");
      if (sp) sp.textContent = `${niceSpeed} • ${niceETA} left`;
    });
  };

  xhr.onload = () => {
    // Server will send real bubbles via socket
    // Remove progress UI
    setTimeout(() => {
      placeholders.forEach(id => {
        const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (!row) return;
        const bubble = row.querySelector(".bubble");
        bubble?.querySelector(".upbar")?.remove();
        bubble?.querySelector(".speedline")?.remove();
      });
    }, 500);
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
