const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, withTx } = require('../db');

const router = express.Router();
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

function establishSession(req, user) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  req.session = { user, csrfToken };
}

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.user) return res.json({ user: null });
  const [u] = await q('SELECT id,nama,email,role,aktif FROM users WHERE id=?', [req.session.user.id]);
  if (!u || !u.aktif) { req.session = null; return res.json({ user: null }); }
  let toko = null;
  if (u.role === 'seller') {
    [toko] = await q('SELECT id,nama_toko,wa FROM toko WHERE user_id=?', [u.id]);
  }
  res.json({ user: u, toko });
});

router.post('/register', async (req, res) => {
  const nama = String(req.body.nama || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role === 'seller' ? 'seller' : 'pembeli';
  if (nama.length < 2) return res.status(400).json({ error: 'Nama minimal 2 karakter.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });

  // Seller wajib melengkapi profil toko
  let toko = null;
  if (role === 'seller') {
    const namaToko = String(req.body.namaToko || '').trim();
    let wa = String(req.body.wa || '').replace(/\D/g, '');
    if (wa.startsWith('0')) wa = '62' + wa.slice(1);
    if (namaToko.length < 2) return res.status(400).json({ error: 'Nama toko minimal 2 karakter.' });
    if (!/^62\d{7,13}$/.test(wa)) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid. Contoh: 081234567890.' });
    }
    toko = { namaToko, wa };
  }

  if ((await q('SELECT id FROM users WHERE email=?', [email])).length) {
    return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk.' });
  }

  const insertId = await withTx(async conn => {
    const [r] = await conn.query(
      'INSERT INTO users (nama,email,password_hash,role) VALUES (?,?,?,?)',
      [nama, email, bcrypt.hashSync(password, 10), role]);
    if (toko) {
      await conn.query('INSERT INTO toko (user_id,nama_toko,wa) VALUES (?,?,?)',
        [r.insertId, toko.namaToko, toko.wa]);
    }
    return r.insertId;
  });

  const user = { id: insertId, nama, email, role };
  establishSession(req, user);
  res.status(201).json({ user });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [u] = await q('SELECT * FROM users WHERE email=?', [email]);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }
  if (!u.aktif) return res.status(403).json({ error: 'Akun Anda dinonaktifkan. Hubungi admin.' });
  const user = { id: u.id, nama: u.nama, email: u.email, role: u.role };
  establishSession(req, user);
  res.json({ user });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

module.exports = router;
