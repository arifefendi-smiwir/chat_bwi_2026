const express = require('express');
const { q, withTx } = require('../db');
const { requireRole } = require('../middleware');

const router = express.Router();
router.use(requireRole('pembeli'));

// Lihat keranjang sendiri
router.get('/', async (req, res) => {
  const rows = await q(`
    SELECT k.produk_id AS produkId, k.jumlah,
           p.nama, p.harga, p.stok, p.image_url AS imageUrl,
           t.nama_toko AS toko, kat.nama AS kategori
    FROM keranjang k
    JOIN produk p ON p.id = k.produk_id
    JOIN toko t ON t.id = p.toko_id
    JOIN kategori kat ON kat.id = p.kategori_id
    WHERE k.user_id = ? ORDER BY k.produk_id`, [req.session.user.id]);
  const total = rows.reduce((s, r) => s + r.harga * r.jumlah, 0);
  res.json({ items: rows, total });
});

// Tambah ke keranjang
router.post('/', async (req, res) => {
  const produkId = Number(req.body.produkId);
  const jumlah = Math.floor(Number(req.body.jumlah || 1));
  if (!Number.isInteger(jumlah) || jumlah < 1) return res.status(400).json({ error: 'Jumlah tidak valid.' });
  const [p] = await q('SELECT id, stok FROM produk WHERE id=?', [produkId]);
  if (!p) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const [ex] = await q('SELECT jumlah FROM keranjang WHERE user_id=? AND produk_id=?', [req.session.user.id, produkId]);
  const baru = (ex ? ex.jumlah : 0) + jumlah;
  if (baru > p.stok) return res.status(400).json({ error: `Stok tidak cukup. Tersedia ${p.stok}.` });
  await withTx(conn => conn.query(
    `INSERT INTO keranjang (user_id,produk_id,jumlah) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE jumlah = VALUES(jumlah)`,
    [req.session.user.id, produkId, baru]));
  res.status(201).json({ ok: true });
});

// Ubah jumlah
router.patch('/:produkId', async (req, res) => {
  const produkId = Number(req.params.produkId);
  const jumlah = Math.floor(Number(req.body.jumlah));
  if (!Number.isInteger(jumlah) || jumlah < 1) return res.status(400).json({ error: 'Jumlah tidak valid.' });
  const [p] = await q('SELECT stok FROM produk WHERE id=?', [produkId]);
  if (!p) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  if (jumlah > p.stok) return res.status(400).json({ error: `Stok tidak cukup. Tersedia ${p.stok}.` });
  const [r] = await withTx(conn => conn.query(
    'UPDATE keranjang SET jumlah=? WHERE user_id=? AND produk_id=?',
    [jumlah, req.session.user.id, produkId]));
  if (!r.affectedRows) return res.status(404).json({ error: 'Item tidak ada di keranjang.' });
  res.json({ ok: true });
});

// Hapus item
router.delete('/:produkId', async (req, res) => {
  const [r] = await withTx(conn => conn.query(
    'DELETE FROM keranjang WHERE user_id=? AND produk_id=?',
    [req.session.user.id, Number(req.params.produkId)]));
  if (!r.affectedRows) return res.status(404).json({ error: 'Item tidak ada di keranjang.' });
  res.json({ ok: true });
});

module.exports = router;
