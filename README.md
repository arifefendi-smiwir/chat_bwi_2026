# Elytra – Marketplace Snack UMKM

Aplikasi production berbasis **Node.js (Express) + MySQL** dengan 3 peran pengguna.

## Peran & fitur

| Peran | Fitur |
|---|---|
| **Pembeli** | Registrasi & login, katalog (cari/filter/sort), keranjang, checkout, riwayat pesanan, pesan via WhatsApp |
| **Seller** | Dashboard toko: CRUD produk miliknya, ringkasan (produk, stok, pesanan, pendapatan), pesanan masuk + ubah status item, pengaturan toko (nama & nomor WA) |
| **Admin** | Statistik global (pengguna, produk, omzet), kelola pengguna (tambah seller/admin, aktif/nonaktif, hapus), kelola kategori, lihat & hapus semua produk, kelola semua pesanan |

## Persiapan

1. **MySQL berjalan** (XAMPP Control Panel atau layanan `MySQL84`).
2. Isi password MySQL di file `.env`:
   ```
   DB_PASSWORD=password_anda
   ```
3. Install & buat database + data dummy:
   ```
   npm install
   npm run setup
   ```
   > `npm run setup` membuat ulang database `elytra` dari awal beserta data dummy.

## Menjalankan

```
npm start
```
Buka **http://localhost:3000** (otomatis ke halaman `/katalog`).

## Akun dummy

| Peran | Email | Password |
|---|---|---|
| Admin | admin@elytra.id | Admin123! |
| Seller (Dapur Rasa Nusantara) | sari@dapur.id | Seller123! |
| Seller (Snack Kita Mart) | budi@snack.id | Seller123! |
| Seller (Keripik Jaya Abadi) | rina@keripik.id | Seller123! |
| Pembeli | andi@mail.com | Pembeli123! |
| Pembeli | dewi@mail.com | Pembeli123! |

## Struktur

```
elytra/
├── scripts/setup.js      # membuat DB + tabel + data dummy
├── db/schema.sql         # skema MySQL (referensi)
├── src/
│   ├── server.js         # entry point Express
│   ├── db.js             # pool MySQL + helper transaksi
│   ├── middleware.js     # requireAuth, requireRole
│   └── routes/           # auth, catalog, cart, orders, seller, admin
└── public/               # frontend (vanilla JS, fetch ke REST API)
```

## Deploy ke Vercel

Aplikasi sudah disiapkan agar bisa berjalan di Vercel (serverless) melalui `api/index.js` + `vercel.json`.

1. **Database**: sediakan MySQL yang dapat diakses publik/oleh Vercel (mis. Aiven, Railway, PlanetScale kompatibel MySQL, dll.), lalu buat skema/tabel dari `db/schema.sql` (atau jalankan `npm run setup` sekali ke DB tersebut).
2. **Environment Variables** (Project Settings → Environment Variables):
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `SESSION_SECRET` = string acak panjang & kuat (wajib di production)
   - `NODE_ENV` = `production`
3. Deploy repository ke Vercel (Build & Output mengikuti konfigurasi proyek/`vercel.json`).

**Keterbatasan di serverless (Vercel):**
- Sesi menggunakan cookie signed (`cookie-session`), bukan store di memori/server.
- Rate limiting bersifat per-instance (tidak global terdistribusi) tanpa store eksternal.
- Upload gambar disimpan di filesystem sementara (`/tmp`) dan **tidak persisten**; untuk produksi gunakan object storage (S3/Cloudinary/Vercel Blob, dll.) dan sesuaikan `src/upload.js`.
- Koneksi DB di-pool secara terbatas; pastikan batas koneksi database mencukupi.

## Catatan desain

- **Autentikasi**: sesi cookie signed (`cookie-session`, kompatibel serverless) + password di-hash `bcrypt`.
- **Otorisasi**: middleware `requireRole()` menjaga endpoint per peran; seller hanya bisa mengubah produk/pesanan milik tokonya (dicek di query).
- **Transaksi**: checkout memakai `BEGIN…COMMIT` + `FOR UPDATE` agar stok tidak balapan; item pesanan menyimpan *snapshot* nama/harga agar riwayat tetap utuh walau produk dihapus.
- **Status pesanan per item**: `baru → diproses → dikirim → selesai`; `batal` mengembalikan stok.
- **Keamanan**: proteksi CSRF (token sesi + header), header keamanan (Helmet), rate limiting auth, validasi signature upload, query berparameter, keluaran HTML di-escape, cookie `httpOnly`/`sameSite`.
- **Gambar**: produk tanpa `imageUrl` memakai placeholder SVG lokal (inisial nama). Laporan uji penetrasi: `docs/LAPORAN_PENTEST_OWASP.md`.
