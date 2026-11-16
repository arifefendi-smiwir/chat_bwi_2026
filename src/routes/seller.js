const express = require('express');
const bcrypt = require('bcryptjs');
const { q, pool, withTx } = require('../db');
const { requireRole } = require('../middleware');
const { uploadGambar, hapusBerkas } = require('../upload');

const router = express.Router();
router.use(requireRole('seller'));

const STATUSES = ['baru', 'diproses', 'dikirim', 'selesai', 'batal'];

/** Middleware kecil: ambil toko milik seller dan taruh di req.toko */
router.use(async (req, res, next) => {
  const [toko] = await q('SELECT id, nama_toko, wa, deskripsi FROM toko WHERE user_id=?', [req.session.user.id]);
  if (!toko) return res.status(400).json({ error: 'Toko tidak ditemukan untuk akun ini. Hubungi admin.' });
  req.toko = toko;
  next();
});

const PRODUCT_FIELDS = `
  p.id, p.nama, p.harga, p.stok, p.deskripsi, p.image_url AS imageUrl,
  p.unggulan, p.kategori_id, k.nama AS kategori, t.nama_toko AS toko`;

// ---- Kelola produk sendiri ----
router.get('/products', async (req, res) => {
  res.json(await q(`SELECT ${PRODUCT_FIELDS} FROM produk p
    JOIN kategori k ON k.id=p.kategori_id JOIN toko t ON t.id=p.toko_id
    WHERE p.toko_id=? ORDER BY p.nama`, [req.toko.id]));
});

function validasiProduk(body) {
  const nama = String(body.nama || '').trim();
  const kategoriId = Number(body.kategoriId);
  // "20.000" / "20,000" / "20000" semuanya dibaca 20000 (harga & stok bilangan bulat Rupiah)
  const keAngka = v => typeof v === 'number' ? v : Number(String(v ?? '').replace(/\D/g, ''));
  const harga = keAngka(body.harga);
  const stok = keAngka(body.stok);
  const deskripsi = String(body.deskripsi || '').trim();
  const imageUrl = String(body.imageUrl || '').trim();
  const unggulan = body.unggulan === true || body.unggulan === 1 || body.unggulan === 'true' || body.unggulan === '1';
  if (nama.length < 2) return { error: 'Nama produk minimal 2 karakter.' };
  if (!kategoriId) return { error: 'Pilih kategori.' };
  if (String(body.harga ?? '').trim() === '' || !Number.isFinite(harga) || harga < 0) return { error: 'Harga harus angka 0 atau lebih, mis. 20.000.' };
  if (String(body.stok ?? '').trim() === '' || !Number.isInteger(stok) || stok < 0) return { error: 'Stok harus bilangan bulat 0 atau lebih.' };
  if (imageUrl && !/^(https?:\/\/|\/|assets\/|\.\.?\/)/.test(imageUrl)) {
    return { error: 'URL gambar harus diawali http(s)://, /uploads/, assets/, atau ./' };
  }
  return { data: { nama, kategoriId, harga: Math.round(harga), stok, deskripsi, imageUrl, unggulan } };
}

router.post('/products', uploadGambar, async (req, res) => {
  const v = validasiProduk(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const [kat] = await q('SELECT id FROM kategori WHERE id=?', [v.data.kategoriId]);
  if (!kat) return res.status(400).json({ error: 'Kategori tidak ditemukan.' });
  const d = v.data;
  if (req.file) d.imageUrl = '/uploads/' + req.file.filename; // berkas unggahan menang
  const [r] = await pool.query(
    'INSERT INTO produk (toko_id,kategori_id,nama,harga,stok,deskripsi,image_url,unggulan) VALUES (?,?,?,?,?,?,?,?)',
    [req.toko.id, d.kategoriId, d.nama, d.harga, d.stok, d.deskripsi, d.imageUrl, d.unggulan]);
  res.status(201).json({ id: r.insertId });
});

router.put('/products/:id', uploadGambar, async (req, res) => {
  const v = validasiProduk(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const [own] = await q('SELECT id, image_url FROM produk WHERE id=? AND toko_id=?', [req.params.id, req.toko.id]);
  if (!own) return res.status(404).json({ error: 'Produk tidak ditemukan (bukan milik toko Anda).' });
  const [kat] = await q('SELECT id FROM kategori WHERE id=?', [v.data.kategoriId]);
  if (!kat) return res.status(400).json({ error: 'Kategori tidak ditemukan.' });
  const d = v.data;
  if (req.file) {
    // ganti gambar: hapus berkas unggahan lama jika ada
    hapusBerkas(own.image_url);
    d.imageUrl = '/uploads/' + req.file.filename;
  }
  await pool.query(
    'UPDATE produk SET kategori_id=?, nama=?, harga=?, stok=?, deskripsi=?, image_url=?, unggulan=? WHERE id=?',
    [d.kategoriId, d.nama, d.harga, d.stok, d.deskripsi, d.imageUrl, d.unggulan, req.params.id]);
  res.json({ ok: true });
});

router.delete('/products/:id', async (req, res) => {
  const [own] = await q('SELECT id, image_url FROM produk WHERE id=? AND toko_id=?', [req.params.id, req.toko.id]);
  if (!own) return res.status(404).json({ error: 'Produk tidak ditemukan (bukan milik toko Anda).' });
  const [r] = await withTx(conn => conn.query(
    'DELETE FROM produk WHERE id=? AND toko_id=?', [req.params.id, req.toko.id]));
  if (r.affectedRows) hapusBerkas(own.image_url);
  res.json({ ok: true });
});

// ---- Pengaturan toko ----
router.get('/store', (req, res) => res.json(req.toko));

router.put('/store', async (req, res) => {
  const namaToko = String(req.body.namaToko || '').trim();
  let wa = String(req.body.wa || '').replace(/\D/g, '');
  if (wa.startsWith('0')) wa = '62' + wa.slice(1);
  const deskripsi = String(req.body.deskripsi || '').trim();
  if (namaToko.length < 2) return res.status(400).json({ error: 'Nama toko minimal 2 karakter.' });
  if (!/^62\d{7,13}$/.test(wa)) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid. Contoh: 081234567890.' });
  await pool.query('UPDATE toko SET nama_toko=?, wa=?, deskripsi=? WHERE id=?', [namaToko, wa, deskripsi, req.toko.id]);
  res.json({ ok: true });
});

// ---- Ringkasan ----
router.get('/stats', async (req, res) => {
  const [prod] = await q('SELECT COUNT(*) AS n, COALESCE(SUM(stok),0) AS stok FROM produk WHERE toko_id=?', [req.toko.id]);
  const [pesanan] = await q(`SELECT
      SUM(status='baru') AS baru, SUM(status='diproses') AS diproses,
      SUM(status='dikirim') AS dikirim, SUM(status='selesai') AS selesai,
      SUM(status='batal') AS batal, COUNT(*) AS totalItem,
      COALESCE(SUM(CASE WHEN status<>'batal' THEN harga*jumlah END),0) AS pendapatan
    FROM pesanan_item WHERE toko_id=?`, [req.toko.id]);
  res.json({ produk: prod.n, stok: prod.stok, ...pesanan });
});

// ---- Pesanan masuk (item milik toko ini) ----
router.get('/orders', async (req, res) => {
  const rows = await q(`
    SELECT i.id, i.pesanan_id AS pesananId, i.nama_produk AS nama, i.harga, i.jumlah,
           i.status, (i.harga*i.jumlah) AS subtotal,
           p.created_at, u.nama AS pembeli, u.email,
           DATE_FORMAT(p.created_at,'%e %M %Y %H:%i') AS tanggal
    FROM pesanan_item i
    JOIN pesanan p ON p.id = i.pesanan_id
    JOIN users u ON u.id = p.user_id
    WHERE i.toko_id=? ORDER BY i.pesanan_id DESC, i.id`, [req.toko.id]);
  res.json(rows);
});

// Ubah status satu item
router.patch('/orders/:itemId/status', async (req, res) => {
  const status = String(req.body.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
  const [item] = await q('SELECT id, produk_id, jumlah, status FROM pesanan_item WHERE id=? AND toko_id=?', [req.params.itemId, req.toko.id]);
  if (!item) return res.status(404).json({ error: 'Item pesanan tidak ditemukan (bukan milik toko Anda).' });

  await withTx(async conn => {
    await conn.query('UPDATE pesanan_item SET status=? WHERE id=?', [status, item.id]);
    // Pembatalan mengembalikan stok produk (sekali saja)
    if (status === 'batal' && !['batal', 'selesai'].includes(item.status) && item.produk_id) {
      await conn.query('UPDATE produk SET stok = stok + ? WHERE id = ?', [item.jumlah, item.produk_id]);
    }
  });
  res.json({ ok: true });
});

module.exports = router;
