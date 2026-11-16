const express = require('express');
const { q, withTx } = require('../db');
const { requireRole } = require('../middleware');

const router = express.Router();

// Checkout: isi keranjang -> pesanan
router.post('/', requireRole('pembeli'), async (req, res) => {
  const result = await withTx(async conn => {
    const [items] = await conn.query(`
      SELECT k.produk_id AS id, k.jumlah, p.nama, p.harga, p.stok, p.toko_id,
             t.nama_toko
      FROM keranjang k
      JOIN produk p ON p.id = k.produk_id
      JOIN toko t ON t.id = p.toko_id
      WHERE k.user_id = ? FOR UPDATE`, [req.session.user.id]);
    if (!items.length) throw Object.assign(new Error('Keranjang kosong.'), { status: 400 });

    for (const it of items) {
      if (it.jumlah > it.stok) {
        throw Object.assign(new Error(`Stok "${it.nama}" tinggal ${it.stok}. Perbarui keranjang.`), { status: 400 });
      }
    }
    const total = items.reduce((s, it) => s + it.harga * it.jumlah, 0);
    const [pes] = await conn.query(
      'INSERT INTO pesanan (user_id,total) VALUES (?,?)', [req.session.user.id, total]);
    for (const it of items) {
      await conn.query(`
        INSERT INTO pesanan_item
          (pesanan_id,produk_id,toko_id,nama_toko,nama_produk,harga,jumlah,status)
        VALUES (?,?,?,?,?,?,?,'baru')`,
        [pes.insertId, it.id, it.toko_id, it.nama_toko, it.nama, it.harga, it.jumlah]);
      await conn.query('UPDATE produk SET stok = stok - ? WHERE id = ?', [it.jumlah, it.id]);
    }
    await conn.query('DELETE FROM keranjang WHERE user_id = ?', [req.session.user.id]);
    return { pesananId: pes.insertId, total };
  });
  res.status(201).json(result);
});

// Riwayat pesanan pembeli
router.get('/', requireRole('pembeli'), async (req, res) => {
  const pesanan = await q(`
    SELECT id, total, DATE_FORMAT(created_at,'%e %M %Y %H:%i') AS tanggal
    FROM pesanan WHERE user_id=? ORDER BY id DESC`, [req.session.user.id]);
  const ids = pesanan.map(p => p.id);
  let items = [];
  if (ids.length) {
    items = await q(`
      SELECT id, pesanan_id AS pesananId, nama_toko AS toko, nama_produk AS nama,
             harga, jumlah, status, (harga*jumlah) AS subtotal
      FROM pesanan_item WHERE pesanan_id IN (${ids.map(() => '?').join(',')})
      ORDER BY id`, ids);
  }
  res.json(pesanan.map(p => ({ ...p, items: items.filter(i => i.pesananId === p.id) })));
});

module.exports = router;
