require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const sellerRoutes = require('./routes/seller');
const adminRoutes = require('./routes/admin');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const isVercel = !!process.env.VERCEL;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'elytra-dev-secret-ganti-di-production') {
  if (isProd) {
    console.error('[SECURITY] SESSION_SECRET wajib diisi dengan nilai acak yang kuat di production.');
  } else {
    console.warn('[SECURITY] SESSION_SECRET belum diset/masih default. Gunakan nilai acak yang kuat di .env');
  }
}

if (isProd || isVercel) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'", "https:"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'self'"],
      "form-action": ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieSession({
  name: 'elytra.sid',
  keys: [process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')],
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd || isVercel,
  maxAge: 1000 * 60 * 60 * 24 * 7,
}));

// CSRF (double-submit token via session + header) untuk request pengubah state
app.get('/api/auth/csrf', (req, res) => {
  if (!req.session) req.session = {};
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ csrfToken: req.session.csrfToken });
});
function requireCsrf(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();
  const token = req.get('x-csrf-token');
  if (!token || !req.session || !req.session.csrfToken || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Token CSRF tidak valid atau hilang. Muat ulang halaman.' });
  }
  next();
}
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/csrf') return next();
  return requireCsrf(req, res, next);
});

// Rate limiting untuk autentikasi
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// API
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/admin', adminRoutes);

// Halaman statis
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Alias rapi tanpa .html
const pages = {
  '/katalog': 'index.html',
  '/masuk': 'login.html',
  '/daftar': 'register.html',
  '/keranjang': 'keranjang.html',
  '/pesanan': 'pesanan.html',
  '/toko': 'seller.html',
  '/admin': 'admin.html',
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', file)));
}
app.get('/', (req, res) => res.redirect('/katalog'));

// 404 API vs halaman
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// Penanganan error terpusat
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const clientMsg = status >= 500 && (isProd || isVercel) ? 'Kesalahan server.' : (err.message || 'Kesalahan server.');
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: clientMsg });
  if (status >= 500 && (isProd || isVercel)) return res.status(status).send('Terjadi kesalahan pada server.');
  res.status(status).send('Terjadi kesalahan: ' + (err.message || 'server'));
});

module.exports = app;