const express = require('express'); // Framework web untuk membuat API & Dashboard.
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io'); // Library untuk komunikasi real-time (Websocket).
const multer = require('multer'); // Middleware khusus untuk menangani upload file (Video/Foto).
const path = require('path'); 
const fs = require('fs'); //mengelola file folder
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg'); 
const http_module = require('http'); // sama ga kaya yg diatas
const https_module = require('https');
require('dotenv').config(); //untuk membaca dari file .env
const session      = require('express-session');
const bcrypt       = require('bcrypt');
const pgSession    = require('connect-pg-simple')(session);

//Inisialisasi Server & Middleware
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Izinkan semua origin 

// Agar Dashboard bisa putar video lewat URL: http://<SERVER_IP>:<PORT>/events/nama_video.mp4
const eventsDir = path.join(__dirname, 'storage', 'events');
if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
app.use('/events', express.static(eventsDir));

// Middleware Static Serving (Akses File) 
const recordingsDir = path.join(__dirname, 'recordings');//Agar browser bisa memutar video melalui URL
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
app.use('/recordings', express.static(recordingsDir));

// EJS setup 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// DATABASE 
const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT),
});

pool.connect((err) => {
  if (err) console.error('❌ DATABASE GAGAL CONNECT:', err.message);
  else      console.log('✅ DATABASE BERHASIL CONNECT');
});

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } //8 jam 
}));

// tabel reports
pool.query(`
  CREATE TABLE IF NOT EXISTS reports (
    id          SERIAL PRIMARY KEY,
    event_type  VARCHAR(100),
    nama        VARCHAR(255),
    confidence  FLOAT,
    image_path  VARCHAR(500),
    status      VARCHAR(50) DEFAULT 'pending',
    created_at  TIMESTAMP DEFAULT NOW()
  );
`).then(() => console.log('✅ TABLE reports SIAP'))
  .catch(err => console.error('❌ Gagal buat tabel reports:', err.message));

// tabel recordings
pool.query(`
  CREATE TABLE IF NOT EXISTS recordings (
    id            SERIAL PRIMARY KEY,
    detection_id  INT REFERENCES reports(id) ON DELETE SET NULL,
    event_type    VARCHAR(100),
    file_name     VARCHAR(255) NOT NULL,
    file_path     VARCHAR(500) NOT NULL,
    duration_sec  INT     DEFAULT 6,
    file_size_kb  INT     DEFAULT 0,
    synced        BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW()
  );
`).then(() => console.log('✅ TABLE recordings SIAP'))
  .catch(err => console.error('❌ Gagal buat tabel recordings:', err.message));

// Multer: simpan video dari Python 
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, recordingsDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); //200 MB maks per upload

// POST /Menerima Laporan Deteksi dari Python AI
app.post('/report-anomaly', async (req, res) => {
  const { nama, confidence, image_path, direction, event_type: rawType } = req.body;
  // Tentukan event_type
  const event_type = rawType || ((!nama || nama === 'Unknown') ? 'Anomali' : 'Terdeteksi');

  try {
    const result = await pool.query(
      `INSERT INTO reports (event_type, nama, confidence, image_path)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [event_type, nama || 'Unknown', confidence, image_path]
    );

    const row = result.rows[0];
    io.emit('new-anomaly', { ...row, direction: direction || null });

    console.log(`💾 DETEKSI DISIMPAN: ${event_type} - ${nama} | direction=${direction || '-'}`);
    res.status(200).json(row);

  } catch (err) {
    console.error('❌ /report-anomaly error:', err.message);
    res.status(500).send("Error");
  }
});

// ─── POST /report-anomaly (dari Python AI) ────────────────────────────────────
app.post('/api/anomaly-clip', async (req, res) => {
  const { source_file, event_timestamp, nama, confidence } = req.body;

  const inputPath = path.join(recordingsDir, source_file || ''); 
  const clipName = `CLIP_${Date.now()}.mp4`;
  const clipPath = path.join(recordingsDir, clipName);
  const event_type = (!nama || nama === 'Unknown') ? 'Anomali' : 'Terdeteksi';

  let detection_id = null;
  try {
    const reportResult = await pool.query(
      `INSERT INTO reports (event_type, nama, confidence, image_path)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [event_type, nama || 'Unknown', confidence, '']
    );
    detection_id = reportResult.rows[0].id;
    io.emit('new-anomaly', reportResult.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (!source_file || !fs.existsSync(inputPath)) {
    return res.status(200).json({ message: 'Report saved, source file missing', detection_id });
  }

  const startSec = Math.max(0, event_timestamp - 3);
  ffmpeg(inputPath)
    .setStartTime(startSec)
    .setDuration(10)
    .output(clipPath)
    .on('end', async () => {
      console.log(`✂️ Clip created: ${clipName}`);
      try {
        const fileSizeKb = Math.round(fs.statSync(clipPath).size / 1024);
        const recResult = await pool.query(
          `INSERT INTO recordings
            (detection_id, event_type, file_name, file_path, duration_sec, file_size_kb, is_clip)
          VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING *`
          [detection_id, event_type, clipName,
           `/recordings/${clipName}`, 10, fileSizeKb]
        );
        io.emit('new-recording', recResult.rows[0]);
        console.log(`🎬 Clip saved & emitted: ${clipName}`);
        res.status(201).json(recResult.rows[0]);
      } catch (err) {
        console.error('❌ Clip DB save error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })
    .on('error', (err) => {
      console.error(`❌ FFmpeg error: ${err.message}`);
      res.status(500).json({ error: err.message });
    })
    .run();
});

// GET / Jembatan Video antara Python dan Dashboard (proxy video dari Python server) 
app.get('/proxy-clip', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) 
    return res.status(400).send('Missing url param');

  if (!targetUrl.startsWith(process.env.PYTHON_SERVER_URL))
    return res.status(403).send('Forbidden');

  const lib = targetUrl.startsWith('https') ? https_module : http;

  lib.get(targetUrl, (proxyRes) => {
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    if (proxyRes.headers['content-length'])
      res.setHeader('Content-Length', proxyRes.headers['content-length']);

    res.statusCode = proxyRes.statusCode;
    proxyRes.pipe(res);
  }).on('error', () => res.status(502).send('Bad Gateway'));
});

// POST / Menerima Upload File Video dari Python (dari Python, kirim file .mp4) 
app.post('/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) 
    return res.status(400).json({ error: 'Tidak ada file video' });

  const { event_type, detection_id, duration_sec } = req.body;
  const fileName   = req.file.filename;
  const fileSizeKb = Math.round(req.file.size / 1024);

  try {
    const { rows } = await pool.query(
      `INSERT INTO recordings (detection_id, event_type, file_name, file_path, duration_sec, file_size_kb)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [detection_id || null, event_type || 'unknown', fileName,
       `/recordings/${fileName}`, duration_sec || 6, fileSizeKb]
    );

    io.emit('new-recording', rows[0]);
    console.log(`🎬 VIDEO DISIMPAN: ${fileName} (${fileSizeKb} KB)`);
    res.status(201).json(rows[0]);

  } catch (err) {
    const fullPath = path.join(recordingsDir, fileName);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    res.status(500).json({ error: err.message });
  }
});

//POST / Menerima Notifikasi Clip Selesai dari Python
app.post('/notify-clip', async (req, res) => {
  const { filename, trigger, clip_url, duration_sec, detection_id } = req.body;

  const event_type = trigger === 'UNKNOWN' ? 'Anomali' : 'Crossing';
  const proxyUrl   = `http://${process.env.SERVER_IP}:${process.env.PORT}/proxy-clip?url=${encodeURIComponent(clip_url)}`;

  try {
    let report_id = detection_id;

    if (!report_id) {
      const { rows } = await pool.query(
        `INSERT INTO reports (event_type, nama, confidence, image_path)
         VALUES ($1, $2, 1.0, $3) RETURNING *`,
        [event_type, trigger, proxyUrl]
      );
      report_id = rows[0].id;
      io.emit('new-anomaly', rows[0]);
    } else {
      await pool.query(
        `UPDATE reports SET image_path = $1 WHERE id = $2`,
        [proxyUrl, report_id]
      );
      io.emit('anomaly-clip-ready', { id: report_id, clip_url: proxyUrl });
    }

    const { rows } = await pool.query(
      `INSERT INTO recordings
        (detection_id, event_type, file_name, file_path, duration_sec, file_size_kb, is_clip)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING *`
      [report_id, event_type, filename, proxyUrl, duration_sec || 10]
    );

    io.emit('new-recording', rows[0]);
    console.log(`🎬 CLIP DITERIMA: ${filename} → ${proxyUrl}`);
    res.status(201).json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware: cek session login 
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
}

// GET /login 
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

// POST /login 
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!rows.length)
      return res.render('login', { error: 'Username atau password salah' });

    const match = await bcrypt.compare(password, rows[0].password);
    if (!match)
      return res.render('login', { error: 'Username atau password salah' });

    req.session.user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
    res.redirect('/dashboard');
  } catch (err) {
    res.render('login', { error: 'Terjadi kesalahan, coba lagi' });
  }
});

// POST /logout 
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// GET /dashboard 
app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const [reports, recordings, stats] = await Promise.all([
      pool.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100'),
      pool.query(`
        SELECT * FROM recordings 
        WHERE is_clip = FALSE
        AND created_at >= NOW() - INTERVAL '3 days'
        ORDER BY created_at DESC LIMIT 50
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM reports)                                                        AS total,
          (SELECT COUNT(*) FROM reports WHERE created_at::date = CURRENT_DATE)                 AS today,
          (SELECT COUNT(*) FROM recordings)                                                     AS total_recordings,
          (SELECT COUNT(*) FROM recordings WHERE synced = false)                               AS unsynced,
          (SELECT COUNT(*) FROM reports WHERE event_type = 'Terdeteksi')                       AS known,
          (SELECT COUNT(*) FROM reports WHERE event_type = 'Anomali')                          AS unknown,
          (SELECT COUNT(*) FROM reports WHERE event_type = 'Line Crossing')                    AS crossing,
          (SELECT COUNT(*) FROM reports WHERE event_type = 'Line Crossing' AND nama ILIKE '%masuk%')  AS crossing_masuk,
          (SELECT COUNT(*) FROM reports WHERE event_type = 'Line Crossing' AND nama ILIKE '%keluar%') AS crossing_keluar
      `)
    ]);

    res.render('index', {
      data:       reports.rows,
      recordings: recordings.rows,
      stats:      stats.rows[0],
      pythonUrl:  process.env.PYTHON_SERVER_URL
    });
  } catch (err) {
    res.status(500).send('Error buka dashboard: ' + err.message);
  }
});

// PATCH /detections/:id/status (update status dari dashboard) 
app.patch('/detections/:id/status', requireLogin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE reports SET status = $1 WHERE id = $2', [status, id]);
    io.emit('detection-updated', { id: parseInt(id), status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /recordings/:id 
app.delete('/recordings/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM recordings WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const fullPath = path.join(recordingsDir, rows[0].file_name);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    await pool.query('DELETE FROM recordings WHERE id = $1', [id]);
    io.emit('recording-deleted', { id: parseInt(id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => res.redirect('/dashboard'));

// Socket.io 
io.on('connection', (socket) => {
  console.log(`🔌 Client terhubung: ${socket.id}`);
  socket.on('disconnect', () => console.log(`🔌 Client disconnect: ${socket.id}`));
});

// START SERVER 
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SERVER JALAN DI http://192.168.21.21:${PORT}`);
  console.log(`📊 Dashboard → http://192.168.21.21:${PORT}/dashboard\n`);
});
