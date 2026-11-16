require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const sellerRoutes = require('./routes/seller');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(session({
  name: 'elytra.sid',
  secret: process.env.SESSION_SECRET || 'elytra-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

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
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: err.message || 'Kesalahan server.' });
  res.status(status).send('Terjadi kesalahan: ' + (err.message || 'server'));
});

app.listen(PORT, () => {
  console.log(`Elytra berjalan di http://localhost:${PORT}`);
});
