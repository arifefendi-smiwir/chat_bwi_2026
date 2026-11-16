/** Penanganan unggahan gambar produk (disimpan di public/uploads). */
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function validSignature(filePath, mime) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (mime === 'image/webp') return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  } catch { /* ignore */ }
  return false;
}

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
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Ukuran gambar maksimal 5 MB.' });
      return res.status(400).json({ error: err.message || 'Gagal memproses gambar.' });
    }
    if (req.file && !validSignature(req.file.path, req.file.mimetype)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Konten file gambar tidak valid.' });
    }
    next();
  });
}

/** Hapus berkas hasil unggahan (hanya berkas di dalam folder uploads). */
function hapusBerkas(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(url))); } catch { /* abaikan */ }
}

module.exports = { UPLOAD_DIR, uploadGambar, hapusBerkas };
