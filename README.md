cat > README.md << 'ENDOFFILE'
# 🖥️ Node.js Backend — Video Analytics AI

Real-time backend server & dashboard for AI-based video analytics system — built to work with any CCTV-enabled environment.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED)

---

## 🚀 Overview

This project is developed as part of an internship at **ISR Lab (Infra Service Research), PT. Telkom Indonesia**, serving as the backend layer for a real-time AI video analytics system.

Instead of handling AI processing directly, this server **receives detection results** from a Python AI edge device, stores them in a database, and presents them on a real-time dashboard.

This system can be applied to various environments that require CCTV-based AI surveillance, such as:
- 🏪 Minimarkets & Retail Stores
- 🏫 Schools & Universities
- 🏢 Office Buildings
- 🏭 Factories & Warehouses
- 🏥 Hospitals & Clinics
- 🅿️ Parking Areas
- 🏨 Hotels & Accommodations

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔴 **Live Stream Proxy** | Streams processed video from Python AI server to dashboard |
| 👤 **Face Detection Logging** | Logs every detected face (known & unknown) to database |
| ⚠️ **Anomaly Reporting** | Receives and stores anomaly reports from Python AI |
| 🚶 **Line Crossing Counter** | Counts entry & exit events in real-time |
| 🎬 **Clip Recording** | Saves and serves 10-second video clips of anomaly events |
| 📊 **Real-time Dashboard** | Live monitoring dashboard using WebSocket |
| 🔐 **Auth & Session** | User login system with bcrypt password hashing |
| 🐳 **Docker Ready** | Fully containerized for easy deployment |

---

## 🧱 Tech Stack

- **Node.js + Express** — Web server & REST API
- **PostgreSQL** — Database for storing detections & recordings
- **Socket.io** — Real-time WebSocket communication to dashboard
- **EJS** — Server-side template engine for dashboard UI
- **Multer** — Handles video file uploads from Python AI
- **FFmpeg** — Cuts video clips around anomaly timestamps
- **bcrypt** — Secure password hashing
- **Docker** — Containerization for deployment

---

## 🏗️ System Architecture
CCTV Camera
│
▼
Python AI Edge Device (separate repo)
├── YOLOv8          → People Detection
├── InsightFace     → Face Recognition
├── Line Crossing   → Entry/Exit Counting
├── Flask Server    → MJPEG Stream + REST API
└── Frame Buffer    → Clip Recording
│
▼
Node.js Backend Server (this repo)
├── REST API        → Receive detections from Python
├── PostgreSQL      → Store reports & recordings
├── Socket.io       → Push updates to dashboard
└── Dashboard UI    → Real-time monitoring
---

## 📁 Project Structure
video-dashboard/
├── views/
│   ├── index.ejs          # Main dashboard page
│   └── login.ejs          # Login page
├── recordings/            # Video recordings folder (not tracked by Git)
├── storage/               # Local storage folder (not tracked by Git)
├── server.js              # Main server file
├── hash-password.js       # Script to hash user passwords
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile.node        # Dockerfile for Node.js
├── package.json           # Project dependencies
├── .env.example           # Environment variable template
└── .gitignore             # Files ignored by Git
---

## ⚙️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/saynaf1702-cyber/video-dashboard.git
cd video-dashboard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
```bash
cp .env.example .env
nano .env
```

Fill in the values:
```env
DB_USER=postgres
DB_HOST=localhost
DB_DATABASE=video_analytics
DB_PASSWORD=your_password_here
DB_PORT=5432

PORT=3000
SERVER_IP=your_server_ip

SESSION_SECRET=your_secret_key_here

PYTHON_SERVER_URL=http://your_python_server_ip:5000
```

### 4. Setup PostgreSQL Database
```bash
psql -U postgres
CREATE DATABASE video_analytics;
\q
```
> Tables will be created automatically when the server starts for the first time.

### 5. Create Login User
```bash
node hash-password.js
```

### 6. Run the Server
```bash
# Normal mode
node server.js

# Development mode (auto-restart)
npx nodemon server.js
```

### 7. Access the Dashboard
Open your browser and go to:
http://your_server_ip:3000/dashboard
---

## 🐳 Docker Deployment

```bash
# Build and run all services
docker-compose up -d

# Check container status
docker-compose ps

# View logs
docker-compose logs -f node
```

---

## 🧠 How It Works

### Detection Flow
1. Python AI detects a person via CCTV stream
2. Python sends detection data to `/report-anomaly`
3. Node.js stores the report in PostgreSQL
4. Socket.io pushes the update to all open dashboards in real-time

### Anomaly Clip Flow
1. Python detects an unknown face or line crossing event
2. Python saves a 10-second clip and notifies `/notify-clip`
3. Node.js converts the clip URL to a proxy URL
4. Dashboard shows a "View Clip" button — click to play the video

### Line Crossing Counter
1. Python tracks each person crossing a virtual boundary line
2. Direction (`masuk`/`keluar`) is sent along with the detection report
3. Dashboard counters update in real-time via Socket.io

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/report-anomaly` | Receive detection report from Python AI |
| POST | `/upload-video` | Receive video file upload from Python AI |
| POST | `/notify-clip` | Receive clip-ready notification from Python AI |
| GET | `/proxy-clip?url=` | Proxy video stream from Python server |
| GET | `/dashboard` | Main dashboard page |
| GET | `/api/health` | Server health check |
| PATCH | `/detections/:id/status` | Update detection status |
| DELETE | `/recordings/:id` | Delete a recording |

---

## 🔗 Related Repository

This project works together with the **Python AI Edge Device** (separate repository) that handles:
- Real-time object & face detection
- MJPEG live stream
- Clip recording & anomaly triggering

---

## 👩‍💻 Author

**Sayyida** — Node.js Backend & Dashboard  
Internship at ISR Lab, PT. Telkom Indonesia — 2026

---

## 📚 References
- [Express.js Documentation](https://expressjs.com)
- [Socket.io Documentation](https://socket.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
ENDOFFILE


