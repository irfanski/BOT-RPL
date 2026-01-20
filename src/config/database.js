import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test koneksi
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Database connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
}

// Helper function untuk query
async function query(sql, params) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

// Helper function untuk transaksi
async function transaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export { pool, query, transaction, testConnection };