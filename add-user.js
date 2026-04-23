const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

// Koneksi ke database (mengambil dari .env)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
});

async function addUser(username, password, role) {
  try {
    // 1. Enkripsi password pakai bcrypt (ini kuncinya!)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 2. Masukkan ke database
    const query = 'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)';
    await pool.query(query, [username, hashedPassword, role]);

    console.log(`✅ User '${username}' berhasil ditambahkan!`);
  } catch (err) {
    console.error('❌ Gagal:', err.message);
  } finally {
    pool.end();
  }
}

// menyesuaikan username yg ingin dibuat
const usernameBaru = 'admin'; // ganti nama usernya
const passwordBaru = 'admin'; // ganti passwordnya
const roleBaru = 'admin';     // ganti role-nya

addUser(usernameBaru, passwordBaru, roleBaru);