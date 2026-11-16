const { q } = require('./db');

/** Wajib sudah login; sesi tetap dipakai hanya jika akun masih aktif. */
async function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
  try {
    const rows = await q('SELECT aktif FROM users WHERE id = ?', [req.session.user.id]);
    if (!rows.length || !rows[0].aktif) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Akun dinonaktifkan. Silakan masuk ulang.' });
    }
  } catch (e) { return res.status(500).json({ error: 'Kesalahan server.' }); }
  next();
}

/** Batasi akses per peran: requireRole('admin') atau requireRole('seller','pembeli') */
function requireRole(...roles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!roles.includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Akses ditolak untuk peran Anda.' });
      }
      next();
    },
  ];
}

module.exports = { requireAuth, requireRole };
