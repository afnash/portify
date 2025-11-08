# 🚀 Portify  
### **Instant, Secure, LAN-based Clipboard & File Transfer**

Portify is a lightweight, offline-first tool that lets you instantly share **text, files, images, links, PDFs, and videos** between your phone and computer — without internet, without accounts, and without any external dependency.

Think **KDE Connect + Snapdrop**, but fully local, transparent, and 100% yours.

---

## ✨ Features

### 🔄 Real-time Clipboard Sync  
Instantly send messages or text snippets across devices over your LAN.

### 📁 File & Image Transfer  
Drag & drop or select files to send directly:
- Images, videos, PDFs, ZIPs, etc.  
- Files auto-save neatly in your `~/Downloads/Portify/` folder.

### 🔐 OTP-Secured Session  
Every new server start generates:
- A unique **Session ID**  
- A **6-digit OTP**  
Only verified clients can connect and exchange data.

### 📲 LAN Discovery via QR  
Simply scan the QR from your phone to connect — no typing IPs.

### 🧹 Auto Cleanup  
Old files and messages older than 24 hours are automatically deleted.

### 🌓 Modern UI  
Minimal, dark/light glassmorphism interface inspired by iOS.

### 💻 📴 Works Fully Offline  
No internet, no external APIs.  
Everything stays within your network.

## The thing :


---


<h2 align="center">📱 App Screenshots</h2>
<img width="1387" height="941" alt="Screenshot from 2025-11-08 13-18-05" src="https://github.com/user-attachments/assets/18120094-036a-48a2-8e80-1f2fb5a07ad0" />
<p align="center">
  <img src="https://github.com/user-attachments/assets/044d3d78-1fa5-4635-a530-57abd92e8e74" width="30%" alt="Screenshot 2" />
  <img src="https://github.com/user-attachments/assets/d73cbc5e-c3ee-472d-92af-75fdaf8b9596" width="30%" alt="Screenshot 1" />
  <img src="https://github.com/user-attachments/assets/b00ce8cd-5dd3-4ec5-b389-e23aaae4dbce" width="30%" alt="Screenshot 3" />
</p>




## 🚀 Getting Started

### 1️⃣ Clone the repository
```bash
git clone https://github.com/afnash/portify.git
cd portify
```

2️⃣ Create and activate a virtual environment
```bash
python3 -m venv venv
source venv/bin/activate
```

3️⃣ Install dependencies
```bash
pip install -r requirements.txt
```

4️⃣ Run the server
```bash
python server.py
```


Once started, you’ll see something like:
```bash
[Portify] Session: a6c39df12b88b5cd
[Portify] OTP (share locally only): 381024
Portify running on http://192.168.1.9:5000
```

📱 Connect a Device

Ensure both devices are on the same Wi-Fi / LAN.

On your phone or another computer, open the shown URL, e.g.:

http://192.168.1.9:5000


Enter the OTP shown in the terminal.

Done — you can now chat, copy, or transfer files instantly.

📂 Project Structure
portify/

│

├── server.py                 # Flask + Socket.IO backend

├── requirements.txt          # Dependencies

├── portify-tray.sh           # Linux tray integration

│

├── static/

│   ├── index.html            # Frontend UI

│   ├── app.js                # Client logic

│   ├── style.css             # UI styles (glass theme)

│   ├── manifest.json         # PWA metadata

│   ├── service-worker.js     # Caching / install script

│   └── assets/

│       ├── logo192.png

│       └── logo512.png

│

└── ~/Downloads/Portify/      # Default file save directory


## 🧠 Tech Stack
Layer	Technology
Backend	Python, Flask, Flask-SocketIO
Frontend	HTML, CSS, Vanilla JS
Realtime	WebSockets
Styling	Tailwind-inspired glassmorphism
Security	OTP verification, isolated LAN communication
System	Linux, YAD tray integration

## 🔒 Security Notes

Portify is meant for trusted local networks.
Data is transferred directly between devices using WebSockets over LAN.
No external servers, databases, or tracking systems are used.
Each session resets with a new OTP to prevent reuse.

## 🧭 Roadmap

Status	Feature
✅	Text & file transfer

✅	OTP-secured session

✅	Auto file cleanup

✅	Modern dark/light UI

🔄	Android WebView app

🔄	Push notifications

🔄	Windows tray client

🔄	Optional HTTPS PWA support

🔄	Share-to-Portify Android intent

🛠 Development Notes

Works best on Python 3.10+

To run headless:
```bash
./portify-tray.sh
```

(Starts the Flask server and adds a tray icon.)

Files uploaded are auto-served via /uploads/ and can be downloaded anytime.



## 🪄 Acknowledgements

Flask & Flask-SocketIO community

Inspiration from KDE Connect, Snapdrop & LocalSend


##🌟 Support

If you found Portify interesting,
⭐ Star this repo — it helps more developers discover it!
