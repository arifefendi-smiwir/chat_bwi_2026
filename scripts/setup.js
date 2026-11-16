/**
 * Setup database Elytra: membuat database, tabel, dan data dummy.
 * Jalankan: npm run setup
 * (Membuat ulang database dari awal - semua data lama pada DB "elytra" hilang.)
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'elytra',
} = process.env;

async function main() {
  console.log(`Menyambung ke MySQL ${DB_HOST}:${DB_PORT} sebagai ${DB_USER}...`);
  const conn = await mysql.createConnection({
    host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD,
    multipleStatements: true,
  }).catch(err => {
    console.error('\nGagal terhubung ke MySQL.');
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('Password/akun salah. Buka file .env dan isi DB_PASSWORD dengan benar, lalu jalankan ulang: npm run setup');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('MySQL tidak berjalan. Nyalakan MySQL (XAMPP Control Panel / layanan MySQL84), lalu jalankan ulang: npm run setup');
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });

  console.log('Membuat database dan tabel...');
  await conn.query('DROP DATABASE IF EXISTS ??', [DB_NAME]);
  await conn.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [DB_NAME]);
  await conn.query(`USE ??`, [DB_NAME]);
  await conn.query(`
    CREATE TABLE users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      nama VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','seller','pembeli') NOT NULL DEFAULT 'pembeli',
      aktif TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
    CREATE TABLE toko (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL UNIQUE,
      nama_toko VARCHAR(100) NOT NULL,
      wa VARCHAR(15) NOT NULL DEFAULT '6281200000000',
      deskripsi VARCHAR(300) NULL,
      CONSTRAINT fk_toko_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
    CREATE TABLE kategori (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      nama VARCHAR(50) NOT NULL UNIQUE
    ) ENGINE=InnoDB;
    CREATE TABLE produk (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      toko_id INT UNSIGNED NOT NULL,
      kategori_id INT UNSIGNED NOT NULL,
      nama VARCHAR(150) NOT NULL,
      harga INT UNSIGNED NOT NULL,
      stok INT UNSIGNED NOT NULL DEFAULT 0,
      deskripsi VARCHAR(600) NOT NULL DEFAULT '',
      image_url VARCHAR(500) NOT NULL DEFAULT '',
      unggulan TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_produk_toko FOREIGN KEY (toko_id) REFERENCES toko(id) ON DELETE CASCADE,
      CONSTRAINT fk_produk_kategori FOREIGN KEY (kategori_id) REFERENCES kategori(id) ON DELETE RESTRICT,
      CONSTRAINT chk_produk_harga CHECK (harga >= 0),
      CONSTRAINT chk_produk_stok CHECK (stok >= 0)
    ) ENGINE=InnoDB;
    CREATE INDEX idx_produk_nama ON produk(nama);
    CREATE INDEX idx_produk_kategori ON produk(kategori_id);
    CREATE TABLE keranjang (
      user_id INT UNSIGNED NOT NULL,
      produk_id INT UNSIGNED NOT NULL,
      jumlah INT UNSIGNED NOT NULL,
      PRIMARY KEY (user_id, produk_id),
      CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_cart_produk FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE,
      CONSTRAINT chk_cart_jumlah CHECK (jumlah > 0)
    ) ENGINE=InnoDB;
    CREATE TABLE pesanan (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      total INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pesanan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT chk_pesanan_total CHECK (total >= 0)
    ) ENGINE=InnoDB;
    CREATE TABLE pesanan_item (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      pesanan_id INT UNSIGNED NOT NULL,
      produk_id INT UNSIGNED NULL,
      toko_id INT UNSIGNED NULL,
      nama_toko VARCHAR(100) NOT NULL,
      nama_produk VARCHAR(150) NOT NULL,
      harga INT UNSIGNED NOT NULL,
      jumlah INT UNSIGNED NOT NULL,
      status ENUM('baru','diproses','dikirim','selesai','batal') NOT NULL DEFAULT 'baru',
      CONSTRAINT fk_item_pesanan FOREIGN KEY (pesanan_id) REFERENCES pesanan(id) ON DELETE CASCADE,
      CONSTRAINT fk_item_produk FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE SET NULL,
      CONSTRAINT fk_item_toko FOREIGN KEY (toko_id) REFERENCES toko(id) ON DELETE SET NULL,
      CONSTRAINT chk_item_harga CHECK (harga >= 0),
      CONSTRAINT chk_item_jumlah CHECK (jumlah > 0)
    ) ENGINE=InnoDB;
    CREATE INDEX idx_item_pesanan ON pesanan_item(pesanan_id);
    CREATE INDEX idx_item_toko ON pesanan_item(toko_id);
  `);

  console.log('Menanam data dummy...');
  const hash = pw => bcrypt.hashSync(pw, 10);

  // ---- Pengguna ----
  const users = [
    ['Admin Elytra', 'admin@elytra.id', hash('Admin123!'), 'admin'],
    ['Sari Wulandari', 'sari@dapur.id', hash('Seller123!'), 'seller'],
    ['Budi Santoso', 'budi@snack.id', hash('Seller123!'), 'seller'],
    ['Rina Kartika', 'rina@keripik.id', hash('Seller123!'), 'seller'],
    ['Andi Pratama', 'andi@mail.com', hash('Pembeli123!'), 'pembeli'],
    ['Dewi Lestari', 'dewi@mail.com', hash('Pembeli123!'), 'pembeli'],
  ];
  const [uRes] = await conn.query(
    'INSERT INTO users (nama,email,password_hash,role) VALUES ?', [users]);
  const uid = i => uRes.insertId + i;
  // 0=admin 1=sari 2=budi 3=rina 4=andi 5=dewi

  // ---- Toko ----
  const tokos = [
    [uid(1), 'Dapur Rasa Nusantara', '628111222333', 'Snack homemade resep keluarga, dibuat harian tanpa pengawet.'],
    [uid(2), 'Snack Kita Mart', '628222333444', 'Aneka snack kekinian untuk teman ngopi dan nonton.'],
    [uid(3), 'Keripik Jaya Abadi', '628333444555', 'Spesialis keripik renyah dari pabrik rumahan Bandung.'],
  ];
  const [tRes] = await conn.query(
    'INSERT INTO toko (user_id,nama_toko,wa,deskripsi) VALUES ?', [tokos]);
  const tid = i => tRes.insertId + i; // 0=DapurRasa 1=SnackKita 2=KeripikJaya

  // ---- Kategori ----
  const kat = [['Keripik'], ['Kacang'], ['Kue Kering'], ['Pedas']];
  const [kRes] = await conn.query('INSERT INTO kategori (nama) VALUES ?', [kat]);
  const kid = i => kRes.insertId + i; // 0=Keripik 1=Kacang 2=KueKering 3=Pedas

  // ---- Produk (seed sesuai SPEC.md + tambahan) ----
  const produk = [
    // [toko, kategori, nama, harga, stok, deskripsi, imageUrl, unggulan]
    [tid(2), kid(0), 'Keripik Singkong Balado', 15000, 24, 'Keripik singkong tipis dengan bumbu balado gurih pedas manis, digoreng dadakan.', '', 1],
    [tid(0), kid(0), 'Keripik Pisang Madu', 18000, 15, 'Keripik pisang kepok disiram madu asli, renyah dan tidak berminyak.', '', 0],
    [tid(1), kid(1), 'Kacang Bawang Renyah', 12000, 40, 'Kacang tanah goreng bumbu bawang, renyah dengan taburan daun jeruk.', '', 0],
    [tid(1), kid(1), 'Kacang Telur Gurih', 14000, 0, 'Kacang berlapis adonan telur gurih, digoreng sampai kuning keemasan.', '', 0],
    [tid(0), kid(2), 'Brownies Kering Cokelat', 25000, 12, 'Brownies kering premium cokelat pekat, isi 20 potong.', '', 1],
    [tid(0), kid(2), 'Nastar Mini Nanas', 45000, 8, 'Nastar mini lembut dengan isian nanas asli, isi 30 butir.', '', 0],
    [tid(1), kid(3), 'Basreng Pedas Daun Jeruk', 20000, 3, 'Baso goreng kering level pedas nampol dengan aroma daun jeruk.', '', 0],
    [tid(1), kid(3), 'Makaroni Bantet Pedas', 13000, 30, 'Makaroni bantet balur bumbu pedas gurih, kefavoritan anak muda.', '', 1],
    // tambahan agar tiap toko berisi lebih dari satu produk
    [tid(2), kid(0), 'Keripik Kentang Mustache', 17000, 20, 'Keripik kentang gurih dengan taburan bubuk barbeque, isi 150 gram.', '', 0],
    [tid(2), kid(3), 'Keripik Seblak Ceker', 22000, 10, 'Keripik seblak kuah ceker pedas, tinggal siram air panas.', '', 0],
    [tid(0), kid(1), 'Kacang Mete Panggang', 55000, 6, 'Kacang mete whole panggang tanpa minyak, rasa manis alami.', '', 0],
    [tid(1), kid(2), 'Putri Salju Kelapa', 38000, 14, 'Kue kering putri salju taburan gula halus dengan kelapa sangrai.', '', 0],
  ];
  const [pRes] = await conn.query(
    'INSERT INTO produk (toko_id,kategori_id,nama,harga,stok,deskripsi,image_url,unggulan) VALUES ?',
    [produk]);
  const pid = i => pRes.insertId + i;

  // ---- Keranjang dummy (andi) ----
  const cart = [
    [uid(4), pid(0), 2],
    [uid(4), pid(4), 1],
  ];
  await conn.query(
    'INSERT INTO keranjang (user_id,produk_id,jumlah) VALUES ?', [cart]);

  // ---- Pesanan dummy ----
  async function buatPesanan(userId, items, statuses) {
    const total = items.reduce((s, it) => s + it[3] * it[4], 0);
    const [p] = await conn.query(
      'INSERT INTO pesanan (user_id,total) VALUES (?,?)', [userId, total]);
    for (let i = 0; i < items.length; i++) {
      const [tok, prod, namaProd, harga, jml, namaTok] = items[i];
      await conn.query(
        'INSERT INTO pesanan_item (pesanan_id,produk_id,toko_id,nama_toko,nama_produk,harga,jumlah,status) VALUES (?,?,?,?,?,?,?,?)',
        [p.insertId, prod, tok, namaTok, namaProd, harga, jml, statuses[i]]);
    }
  }

  // Pesanan 1 (andi): keripik singkong (Dapur? bukan - toko KeripikJaya) + brownies
  await buatPesanan(uid(4), [
    [tid(2), pid(0), 'Keripik Singkong Balado', 15000, 2, 'Keripik Jaya Abadi'],
    [tid(0), pid(4), 'Brownies Kering Cokelat', 25000, 1, 'Dapur Rasa Nusantara'],
  ], ['dikirim', 'diproses']);

  // Pesanan 2 (dewi): kacang bawang + makaroni
  await buatPesanan(uid(5), [
    [tid(1), pid(2), 'Kacang Bawang Renyah', 12000, 3, 'Snack Kita Mart'],
    [tid(1), pid(7), 'Makaroni Bantet Pedas', 13000, 2, 'Snack Kita Mart'],
  ], ['selesai', 'batal']);

  await conn.end();

  console.log(`
==============================================
  Setup selesai!
  Akun dummy (login dengan email di bawah):
    Admin   : admin@elytra.id  / Admin123!
    Seller  : sari@dapur.id    / Seller123!
    Seller  : budi@snack.id    / Seller123!
    Seller  : rina@keripik.id  / Seller123!
    Pembeli : andi@mail.com    / Pembeli123!
    Pembeli : dewi@mail.com    / Pembeli123!
  Jalankan server: npm start
==============================================`);
}

main();
