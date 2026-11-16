const express = require('express');
const bcrypt = require('bcryptjs');
const { q, pool, withTx } = require('../db');
const { requireRole } = require('../middleware');
const { hapusBerkas } = require('../upload');

const router = express.Router();
router.use(requireRole('admin'));

const STATUSES = ['baru', 'diproses', 'dikirim', 'selesai', 'batal'];
const ROLES = ['admin', 'seller', 'pembeli'];

// ---- Statistik global ----
router.get('/stats', async (req, res) => {
  const [users] = await q(`SELECT
      SUM(role='admin') AS admin, SUM(role='seller') AS seller,
      SUM(role='pembeli') AS pembeli, COUNT(*) AS total FROM users`);
  const [prod] = await q('SELECT COUNT(*) AS n, COALESCE(SUM(stok),0) AS stok FROM produk');
  const [pes] = await q(`SELECT
      COUNT(*) AS totalPesanan,
      COALESCE(SUM(CASE WHEN i.status<>'batal' THEN i.harga*i.jumlah END),0) AS omzet,
      SUM(i.status='baru') AS itemBaru
    FROM pesanan p JOIN pesanan_item i ON i.pesanan_id=p.id`);
  res.json({ users, produk: prod, pesanan: pes });
});

// ---- Kelola pengguna ----
router.get('/users', async (req, res) => {
  res.json(await q(`
    SELECT u.id, u.nama, u.email, u.role, u.aktif,
           DATE_FORMAT(u.created_at,'%e %M %Y') AS tanggal,
           t.nama_toko, t.wa
    FROM users u LEFT JOIN toko t ON t.user_id=u.id
    ORDER BY u.role, u.nama`));
});

// Tambah pengguna (mis. membuat akun seller/admin baru)
router.post('/users', async (req, res) => {
  const nama = String(req.body.nama || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '');
  const namaToko = String(req.body.namaToko || '').trim();
  let wa = String(req.body.wa || '').replace(/\D/g, '');
  if (wa.startsWith('0')) wa = '62' + wa.slice(1);
  if (nama.length < 2) return res.status(400).json({ error: 'Nama minimal 2 karakter.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Email tidak valid.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Peran tidak valid.' });
  if (role === 'seller' && namaToko.length < 2) return res.status(400).json({ error: 'Nama toko wajib untuk seller.' });
  if (role === 'seller' && !/^62\d{7,13}$/.test(wa)) return res.status(400).json({ error: 'Nomor WA seller tidak valid (contoh 081234567890).' });
  if (await q('SELECT id FROM users WHERE email=?', [email]).then(r => r.length)) {
    return res.status(409).json({ error: 'Email sudah terdaftar.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO users (nama,email,password_hash,role) VALUES (?,?,?,?)',
      [nama, email, bcrypt.hashSync(password, 10), role]);
    if (role === 'seller') {
      await conn.query('INSERT INTO toko (user_id,nama_toko,wa) VALUES (?,?,?)', [r.insertId, namaToko, wa]);
    }
    await conn.commit();
    res.status(201).json({ id: r.insertId });
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
});

// Aktif / nonaktifkan pengguna
router.patch('/users/:id', async (req, res) => {
  const aktif = req.body.aktif ? 1 : 0;
  if (Number(req.params.id) === req.session.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri.' });
  }
  const [r] = await withTx(conn => conn.query('UPDATE users SET aktif=? WHERE id=?', [aktif, req.params.id]));
  if (!r.affectedRows) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
  res.json({ ok: true });
});

// Hapus pengguna (toko & produk ikut terhapus; riwayat item tetap sebagai snapshot)
router.delete('/users/:id', async (req, res) => {
  if (Number(req.params.id) === req.session.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
  }
  const [r] = await withTx(conn => conn.query('DELETE FROM users WHERE id=?', [req.params.id]));
  if (!r.affectedRows) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
  res.json({ ok: true });
});

// ---- Kelola semua produk (lihat & hapus; edit isi dilakukan seller) ----
router.get('/products', async (req, res) => {
  res.json(await q(`
    SELECT p.id, p.nama, p.harga, p.stok, p.unggulan, k.nama AS kategori,
           t.nama_toko AS toko, u.email AS sellerEmail, u.aktif AS sellerAktif
    FROM produk p
    JOIN kategori k ON k.id=p.kategori_id
    JOIN toko t ON t.id=p.toko_id
    JOIN users u ON u.id=t.user_id
    ORDER BY t.nama_toko, p.nama`));
});

router.delete('/products/:id', async (req, res) => {
  const [p] = await q('SELECT id, image_url FROM produk WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const [r] = await withTx(conn => conn.query('DELETE FROM produk WHERE id=?', [req.params.id]));
  if (r.affectedRows) hapusBerkas(p.image_url);
  res.json({ ok: true });
});

// ---- Kelola kategori ----
router.get('/categories', async (req, res) => {
  res.json(await q(`
    SELECT k.id, k.nama, COUNT(p.id) AS jumlahProduk
    FROM kategori k LEFT JOIN produk p ON p.kategori_id=k.id
    GROUP BY k.id, k.nama ORDER BY k.nama`));
});

router.post('/categories', async (req, res) => {
  const nama = String(req.body.nama || '').trim();
  if (nama.length < 2) return res.status(400).json({ error: 'Nama kategori minimal 2 karakter.' });
  try {
    const [r] = await pool.query('INSERT INTO kategori (nama) VALUES (?)', [nama]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Kategori sudah ada.' });
    throw e;
  }
});

router.put('/categories/:id', async (req, res) => {
  const nama = String(req.body.nama || '').trim();
  if (nama.length < 2) return res.status(400).json({ error: 'Nama kategori minimal 2 karakter.' });
  try {
    const [r] = await withTx(conn => conn.query('UPDATE kategori SET nama=? WHERE id=?', [nama, req.params.id]));
    if (!r.affectedRows) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Kategori sudah ada.' });
    throw e;
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const [r] = await withTx(conn => conn.query('DELETE FROM kategori WHERE id=?', [req.params.id]));
    if (!r.affectedRows) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ error: 'Kategori masih dipakai produk. Pindahkan/hapus produknya dulu.' });
    }
    throw e;
  }
});

// ---- Semua pesanan ----
router.get('/orders', async (req, res) => {
  const rows = await q(`
    SELECT i.id, i.pesanan_id AS pesananId, i.nama_toko AS toko, i.nama_produk AS nama,
           i.harga, i.jumlah, i.status, (i.harga*i.jumlah) AS subtotal,
           u.nama AS pembeli, u.email,
           DATE_FORMAT(p.created_at,'%e %M %Y %H:%i') AS tanggal
    FROM pesanan_item i
    JOIN pesanan p ON p.id=i.pesanan_id
    JOIN users u ON u.id=p.user_id
    ORDER BY i.pesanan_id DESC, i.id`);
  res.json(rows);
});

router.patch('/orders/:itemId/status', async (req, res) => {
  const status = String(req.body.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
  const [item] = await q('SELECT id, produk_id, jumlah, status FROM pesanan_item WHERE id=?', [req.params.itemId]);
  if (!item) return res.status(404).json({ error: 'Item pesanan tidak ditemukan.' });
  await withTx(async conn => {
    await conn.query('UPDATE pesanan_item SET status=? WHERE id=?', [status, item.id]);
    if (status === 'batal' && !['batal', 'selesai'].includes(item.status) && item.produk_id) {
      await conn.query('UPDATE produk SET stok = stok + ? WHERE id = ?', [item.jumlah, item.produk_id]);
    }
  });
  res.json({ ok: true });
});

module.exports = router;
