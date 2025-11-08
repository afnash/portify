console.log("🔥 Portify app.js loaded:", navigator.userAgent);

/**************** SERVICE WORKER REGISTRATION ****************/
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/static/service-worker.js")
    .then(reg => console.log("✅ SW registered:", reg.scope))
    .catch(err => console.error("❌ SW registration error:", err));
} else {
  console.warn("⚠️ Service Worker not supported in this browser.");
}

/**************** DEVICE ID ****************/
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

/**************** PWA INSTALL ****************/
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

/**************** THEME TOGGLE ****************/
const themeBtn = document.getElementById("themeBtn");
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light") document.body.classList.add("light");
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
});

/**************** SOCKET.IO ****************/
const socket = io({ transports: ["websocket"], upgrade: false });
const netDot = document.getElementById("netDot");
socket.on("connect", () => { netDot.className = "dot online"; });
socket.on("disconnect", () => { netDot.className = "dot offline"; });

/**************** DOM REFERENCES ****************/
const feed = document.getElementById("feed");
const msgBox = document.getElementById("msgBox");
const sendBtn = document.getElementById("sendBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const ipLine = document.getElementById("ipLine");
const qr = document.querySelector(".qr");
const qrToggle = document.getElementById("qrToggle");
const lock = document.getElementById("lock");
const otpInput = document.getElementById("otpInput");
const otpBtn = document.getElementById("otpBtn");
const otpError = document.getElementById("otpError");

/**************** QR COLLAPSE ****************/
function setQrCollapsed(c) {
  if (c) qr.classList.add("collapsed");
  else qr.classList.remove("collapsed");
  localStorage.setItem("qrCollapsed", c ? "1" : "0");
}
setQrCollapsed(localStorage.getItem("qrCollapsed") === "1");
qrToggle.addEventListener("click", () => setQrCollapsed(!qr.classList.contains("collapsed")));

/**************** OTP SESSION ****************/
let UPLOAD_TOKEN = null;

socket.on("otp_required", ({ session }) => {
  const saved = localStorage.getItem("portify-token");
  if (saved) socket.emit("verify_token", { token: saved });
  else showLock();
});

socket.on("otp_ok", ({ token }) => {
  if (token) {
    UPLOAD_TOKEN = token;
    localStorage.setItem("portify-token", token);
  }
  hideLock();
});

socket.on("otp_fail", () => {
  showLock();
  otpError.hidden = false;
  otpInput.select();
});

function showLock() {
  lock.classList.add("show");
  otpError.hidden = true;
  otpInput.value = "";
  setTimeout(() => otpInput.focus(), 100);
}
function hideLock() {
  lock.classList.remove("show");
}
otpBtn.addEventListener("click", submitOtp);
otpInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitOtp(); });

function submitOtp() {
  const v = otpInput.value.replace(/\D/g, "").slice(0, 6);
  if (v.length !== 6) { otpError.hidden = false; return; }
  socket.emit("verify_otp", { otp: v });
}

/**************** SOCKET EVENTS ****************/
socket.on("bootstrap", ({ messages, ip }) => {
  ipLine.textContent = `Open on phone: http://${ip}:5000`;
  feed.innerHTML = "";
  messages.forEach(addItem);
  autoscroll();
  if (messages?.length && localStorage.getItem("qrCollapsed") !== "1") setQrCollapsed(true);
});

socket.on("history_append", ({ items }) => {
  items.forEach(addItem);
  if (items?.length && localStorage.getItem("qrCollapsed") !== "1") setQrCollapsed(true);
  autoscroll();
});

socket.on("delete_items", ({ ids }) => {
  if (!ids) return;
  ids.forEach(id => {
    const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) row.remove();
    SEEN.delete(id);
  });
});

/**************** RETRY + SHIMMER ****************/
function retryLoad(el, url, attempts = 6) {
  let tries = 0;
  const tryFetch = () => {
    fetch(url, { method: "HEAD", cache: "no-store" })
      .then(res => {
        if (res.ok) {
          el.src = url;
          el.classList.remove("loading");
        } else if (tries++ < attempts) {
          setTimeout(tryFetch, 400);
        }
      })
      .catch(() => {
        if (tries++ < attempts) setTimeout(tryFetch, 400);
      });
  };
  tryFetch();
}

/**************** ADD MESSAGE / FILE PREVIEW ****************/
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

    if (item.size || item.kind) {
      const sub = document.createElement("div");
      const kind = (item.kind || "").split("/")[1] || "file";
      sub.className = "filesub";
      sub.textContent = [niceSize(item.size || 0), kind.toUpperCase()].join(" • ");
      bubble.appendChild(sub);
    }

    // preview with shimmer loading
    if (/\.(png|jpe?g|gif|webp)$/i.test(item.name)) {
      const img = document.createElement("img");
      img.className = "preview loading";
      bubble.appendChild(img);
      retryLoad(img, item.url);
    } else if (/\.(mp4|webm|mov)$/i.test(item.name)) {
      const v = document.createElement("video");
      v.controls = true;
      v.className = "preview loading";
      bubble.appendChild(v);
      retryLoad(v, item.url);
    }
  }

  const ts = document.createElement("div");
  ts.className = "time-under";
  ts.textContent = new Date(item.time || Date.now()).toLocaleTimeString();

  row.appendChild(bubble);
  row.appendChild(ts);
  feed.appendChild(row);
}

function niceSize(bytes) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
}
function autoscroll() { feed.scrollTop = feed.scrollHeight; }

/**************** TEXT SENDING ****************/
sendBtn.addEventListener("click", () => {
  const text = msgBox.value.trim();
  if (!text) return;
  const id = generateId();
  const item = { id, type: "text", content: text, time: new Date().toISOString(), client_id: CLIENT_ID };
  addItem(item); SEEN.add(id);
  socket.emit("send_text", { text, client_id: CLIENT_ID, id });
  msgBox.value = "";
  autoscroll();
});
msgBox.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }});

/**************** FILE UPLOAD ****************/
fileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { if (fileInput.files?.length) uploadFiles(fileInput.files); fileInput.value = ""; });
["dragenter", "dragover"].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("show"); }));
["dragleave", "drop"].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("show"); }));
dropzone.addEventListener("drop", e => { const f = e.dataTransfer.files; if (f?.length) uploadFiles(f); });

function uploadFiles(files) {
  if (!UPLOAD_TOKEN) { alert("Not verified. Enter OTP first."); showLock(); return; }

  const ids = [];
  const placeholders = [];

  for (const f of files) {
    const id = generateId(); ids.push(id);
    const item = {
      id, type: "file", name: f.name, url: "#", download: "#",
      time: new Date().toISOString(), client_id: CLIENT_ID,
      size: f.size, kind: f.type || "application/octet-stream"
    };
    addItem(item);
    placeholders.push(id);

    const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const bubble = row?.querySelector(".bubble");
    if (bubble) {
      const bar = document.createElement("div"); bar.className = "upbar";
      const fill = document.createElement("div"); fill.className = "upfill";
      bar.appendChild(fill);
      const sp = document.createElement("div"); sp.className = "speedline"; sp.textContent = "Starting…";
      bubble.appendChild(bar); bubble.appendChild(sp);
    }
  }

  const fd = new FormData();
  for (const f of files) fd.append("files[]", f);
  for (const id of ids) fd.append("ids[]", id);
  fd.append("client_id", CLIENT_ID);
  fd.append("token", UPLOAD_TOKEN);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload", true);

  const start = Date.now();
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    const elapsed = (Date.now() - start) / 1000;
    const speed = e.loaded / elapsed;
    const remain = e.total - e.loaded;
    const eta = remain / (speed || 1);
    const niceSpeed = speed > 1_000_000 ? (speed / 1_000_000).toFixed(1) + " MB/s" : (speed / 1000).toFixed(1) + " KB/s";
    const niceETA = eta > 60 ? Math.round(eta / 60) + "m" : Math.round(eta) + "s";
    placeholders.forEach(id => {
      const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      const fill = row.querySelector(".upfill");
      const sp = row.querySelector(".speedline");
      if (fill) fill.style.width = pct + "%";
      if (sp) sp.textContent = `${niceSpeed} • ${niceETA} left`;
    });
  };

  xhr.onload = () => {
    setTimeout(() => {
      placeholders.forEach(id => {
        const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (!row) return;
        row.querySelector(".upbar")?.remove();
        row.querySelector(".speedline")?.remove();
      });
    }, 500);
  };

  xhr.send(fd);
}

/**************** STOP SERVER ****************/
const stopBtn = document.getElementById("stopBtn");
stopBtn.addEventListener("click", () => {
  if (!confirm("Stop the Portify server now?")) return;
  fetch("/__shutdown__", { method: "POST" }).then(() => {
    document.body.innerHTML = `
      <div style="height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:system-ui;color:var(--fg)">
        <h2>🔌 Connection Ended</h2>
        <p>Server stopped successfully.</p>
      </div>
    `;
  });
});
