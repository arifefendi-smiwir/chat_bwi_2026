/** Penanganan unggahan gambar produk (disimpan di public/uploads). */
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null,
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + (EXT[file.mimetype] || '')),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(new Error('Format gambar harus JPG, PNG, atau WebP.'));
  },
});

/** Middleware pemroses satu berkas (kolom "gambar"), dengan pesan galat ramah. */
function uploadGambar(req, res, next) {
  upload.single('gambar')(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Ukuran gambar maksimal 5 MB.' });
    return res.status(400).json({ error: err.message || 'Gagal memproses gambar.' });
  });
}

/** Hapus berkas hasil unggahan (hanya berkas di dalam folder uploads). */
function hapusBerkas(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(url))); } catch { /* abaikan */ }
}

module.exports = { UPLOAD_DIR, uploadGambar, hapusBerkas };
