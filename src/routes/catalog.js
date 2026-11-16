const express = require('express');
const { q } = require('../db');

const router = express.Router();

// Daftar kategori + jumlah produk per kategori (dipakai seller & admin)
router.get('/categories', async (req, res) => {
  const rows = await q(`
    SELECT k.id, k.nama, COUNT(p.id) AS jumlah
    FROM kategori k LEFT JOIN produk p ON p.kategori_id = k.id
    GROUP BY k.id, k.nama ORDER BY k.nama`);
  res.json(rows);
});

// Opsi pengurutan hasil pencarian.
// "terkait" relevan terhadap kata kunci; "terlaris" memakai total penjualan (item tidak batal).
const SORTS = {
  unggulan: { order: 'p.unggulan DESC, p.nama ASC' },
  nama:     { order: 'p.nama ASC' },
  murah:    { order: 'p.harga ASC' },
  mahal:    { order: 'p.harga DESC' },
  stok:     { order: 'p.stok DESC' },
  terkait:  { order: '(p.nama LIKE ?) DESC, p.unggulan DESC, p.nama ASC', needQ: true },
  terbaru:  { order: 'p.created_at DESC, p.id DESC' },
  terlaris: { order: 's.terjual DESC, p.nama ASC' },
  termahal: { order: 'p.harga DESC' },
  termurah: { order: 'p.harga ASC' },
};

// Katalog publik: q, kategori (id), sort
router.get('/products', async (req, res) => {
  const qy = String(req.query.q || '').trim();
  const kat = Number(req.query.kategori || 0);
  const sort = SORTS[req.query.sort] || SORTS.unggulan;

  let sql = `
    SELECT p.id, p.nama, p.harga, p.stok, p.deskripsi, p.image_url AS imageUrl,
           p.unggulan, k.nama AS kategori, t.nama_toko AS toko, t.wa,
           COALESCE(s.terjual, 0) AS terjual
    FROM produk p
    JOIN kategori k ON k.id = p.kategori_id
    JOIN toko t ON t.id = p.toko_id
    LEFT JOIN (
      SELECT produk_id, SUM(jumlah) AS terjual
      FROM pesanan_item WHERE status <> 'batal'
      GROUP BY produk_id
    ) s ON s.produk_id = p.id
    WHERE 1=1`;
  const params = [];
  if (qy) { sql += ' AND (p.nama LIKE ? OR p.deskripsi LIKE ?)'; params.push(`%${qy}%`, `%${qy}%`); }
  if (kat) { sql += ' AND p.kategori_id = ?'; params.push(kat); }
  // Parameter ORDER BY ("terkait") ditambahkan setelah parameter WHERE sesuai urutan teks SQL
  sql += ' ORDER BY ' + sort.order;
  if (sort.needQ && qy) params.push(`%${qy}%`);
  res.json(await q(sql, params));
});

// Detail satu produk (publik)
router.get('/products/:id', async (req, res) => {
  const [p] = await q(`
    SELECT p.id, p.nama, p.harga, p.stok, p.deskripsi, p.image_url AS imageUrl,
           p.unggulan, k.nama AS kategori, t.nama_toko AS toko, t.wa, t.deskripsi AS tokoDeskripsi
    FROM produk p JOIN kategori k ON k.id=p.kategori_id JOIN toko t ON t.id=p.toko_id
    WHERE p.id=?`, [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  res.json(p);
});

module.exports = router;
