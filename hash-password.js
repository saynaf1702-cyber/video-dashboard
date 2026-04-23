const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user:     process.env.DB_USER,     
  host:     process.env.DB_HOST,     
  database: process.env.DB_DATABASE, 
  password: process.env.DB_PASSWORD, 
  port:     parseInt(process.env.DB_PORT),
});

async function hashPasswords() {
  const users = await pool.query('SELECT * FROM users');
  
  for (const user of users.rows) {
    const hashed = await bcrypt.hash(user.password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
    console.log(`✅ Password user "${user.username}" berhasil di-hash`);
  }

  console.log('🎉 Semua password sudah di-hash!');
  pool.end();
}

hashPasswords();