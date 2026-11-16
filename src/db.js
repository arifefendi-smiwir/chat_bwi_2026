const mysql = require('mysql2/promise');
require('dotenv').config();

const isVercel = !!process.env.VERCEL;
const poolConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'elytra',
  waitForConnections: true,
  connectionLimit: isVercel ? 2 : 10,
  namedPlaceholders: false,
};

const pool = global.__elytraPool || (global.__elytraPool = mysql.createPool(poolConfig));

/** query(sql, params) -> [rows] */
async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Transaksi: const {conn} = ...; try { await tx(...) } finally { release } */
async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, q, withTx };
